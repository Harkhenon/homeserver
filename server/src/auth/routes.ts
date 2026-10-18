import type { FastifyInstance, FastifyReply } from "fastify";
import type { AuthStore } from "./store.js";
import {
  verifyTotp,
  generateTotpSecret,
  verifyDummyPassword,
} from "./crypto.js";

export interface AuthBody {
  username?: unknown;
  password?: unknown;
  totp?: unknown;
}

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60_000;
const BLOCK_MS = 15 * 60_000;
const COOKIE_NAME = "hs_session";
const JWT_TTL_S = 12 * 60 * 60; // 12h — aligné sur le cookie

interface Attempt {
  count: number;
  windowStart: number;
  blockedUntil: number;
}

/**
 * Compteur de tentatives persistant (IP + username), clé = "ip|username".
 * Survit aux redémarrages (fichier auth.json.attempts).
 */
function makeFailCounter(store: AuthStore) {
  const keyOf = (ip: string, username: string) =>
    `${ip}|${username.slice(0, 64)}`;

  const isBlocked = (key: string): boolean => {
    const a = store.loadCounters()[key];
    return a !== undefined && a.blockedUntil > Date.now();
  };

  const recordFailure = (key: string): void => {
    const now = Date.now();
    const counters = store.loadCounters();
    const a = counters[key];
    if (!a || now - a.windowStart > WINDOW_MS) {
      counters[key] = { count: 1, windowStart: now, blockedUntil: 0 };
    } else {
      a.count += 1;
      if (a.count >= MAX_ATTEMPTS) {
        a.blockedUntil = now + BLOCK_MS;
        a.count = 0;
        a.windowStart = now;
      }
    }
    // Purge : on garde max 1000 clés et on jette les entrées expirées
    for (const [k, v] of Object.entries(counters)) {
      if (
        v.blockedUntil < now - BLOCK_MS &&
        k !== key &&
        now - v.windowStart > WINDOW_MS
      )
        delete counters[k];
    }
    const keys = Object.keys(counters);
    if (keys.length > 1000)
      for (const k of keys.slice(0, keys.length - 1000)) delete counters[k];
    store.saveCounters(counters);
  };

  const recordSuccess = (key: string): void => {
    const counters = store.loadCounters();
    if (counters[key]) {
      delete counters[key];
      store.saveCounters(counters);
    }
  };

  return { keyOf, isBlocked, recordFailure, recordSuccess };
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  secure: boolean,
): void {
  reply.setCookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/",
    maxAge: 12 * 60 * 60, // 12h
  });
}

export function registerAuthRoutes(
  app: FastifyInstance,
  store: AuthStore,
  opts: { secureCookies: boolean },
): void {
  const failCounter = makeFailCounter(store);

  // --- Rate-limit strict sur les routes d'authentification (au-delà du global) ---
  app.post("/api/auth/login", {
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    handler: async (request, reply) => {
      const ip = request.ip;
      const body = (request.body ?? {}) as AuthBody;
      const username = typeof body.username === "string" ? body.username : "";
      const password = typeof body.password === "string" ? body.password : "";
      const totp = typeof body.totp === "string" ? body.totp : "";
      const key = failCounter.keyOf(ip, username);

      if (failCounter.isBlocked(key)) {
        return reply
          .code(429)
          .send({ error: "Trop de tentatives, réessayez plus tard" });
      }

      const state = store.load();
      const usernameOk = username === state.adminUser;
      let passwordOk = false;
      // Timing constant : on brûle toujours une vérification scrypt, même si l'utilisateur n'existe pas
      if (usernameOk) {
        passwordOk = (await store.verifyPassword(password)).ok;
      } else {
        await verifyDummyPassword(password); // timing constant, pas d'oracle
      }

      // Journaliser la tentative (avant toute réponse)
      void store
        .recordAttempt({
          at: new Date().toISOString(),
          ip,
          username: username.slice(0, 64),
          success: usernameOk && passwordOk,
        })
        .catch(() => undefined);

      if (!usernameOk || !passwordOk) {
        failCounter.recordFailure(key);
        return reply.code(401).send({ error: "Identifiants invalides" });
      }

      // 2FA : si activée, le code est requis, valide et non rejoué
      if (state.totpSecret) {
        if (!totp) {
          // need2fa ne fuit pas plus d'info que la présence obligatoire d'un 2e facteur
          return reply
            .code(401)
            .send({ error: "Code 2FA requis", need2fa: true });
        }
        const counter = verifyTotp(state.totpSecret, totp);
        if (counter === null || counter <= (state.totpLastCounter ?? -1)) {
          failCounter.recordFailure(key);
          return reply
            .code(401)
            .send({ error: "Code 2FA invalide", need2fa: true });
        }
        await store.setTotpLastCounter(counter);
      }

      failCounter.recordSuccess(key);
      const token = app.jwt.sign(
        { sub: username, role: "admin", gen: store.getSessionGen() },
        { expiresIn: JWT_TTL_S },
      );
      setSessionCookie(reply, token, opts.secureCookies);
      return { token, username }; // token conservé pour compat clients non-cookie (updater, API script)
    },
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, { path: "/" });
    return { ok: true };
  });

  app.post("/api/auth/logout-all", async () => {
    // Révoque toutes les sessions (JWT passés et futurs jusqu'à nouvelle génération)
    await store.bumpSessionGen();
    return { ok: true };
  });

  // Authentifié : ne révèle plus le nom admin sans session valide
  app.get("/api/auth/me", async () => {
    const state = store.load();
    return {
      username: state.adminUser,
      totpEnabled: Boolean(state.totpSecret),
    };
  });

  app.get("/api/auth/attempts", { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async () => {
    return { attempts: store.getAttempts().slice(0, 50) };
  });

  app.post("/api/auth/attempts/clear", async () => {
    await store.clearAttempts();
    return { ok: true };
  });

  // --- 2FA ---
  app.post("/api/auth/totp/setup", { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async () => {
    const state = store.load();
    if (state.totpSecret) {
      return { error: "2FA déjà activée — désactive-la d'abord" };
    }
    const { secret, otpauthUrl } = generateTotpSecret(state.adminUser);
    // Le secret n'est PAS persisté ici : le client doit confirmer avec un code valide.
    return { secret, otpauthUrl };
  });

  app.post("/api/auth/totp/enable", { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = (request.body ?? {}) as { secret?: unknown; code?: unknown };
    const secret = typeof body.secret === "string" ? body.secret : "";
    const code = typeof body.code === "string" ? body.code : "";
    if (!secret || !code)
      return reply.code(400).send({ error: "secret et code requis" });
    const counter = verifyTotp(secret, code);
    if (counter === null)
      return reply.code(400).send({ error: "Code invalide — réessaie" });
    await store.setTotp(secret);
    await store.setTotpLastCounter(counter);
    return { ok: true, totpEnabled: true };
  });

  app.post("/api/auth/totp/disable", { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = (request.body ?? {}) as { password?: unknown; code?: unknown };
    const password = typeof body.password === "string" ? body.password : "";
    const code = typeof body.code === "string" ? body.code : "";
    const state = store.load();
    if (!state.totpSecret) return { ok: true, totpEnabled: false };
    const { ok: passwordOk } = await store.verifyPassword(password);
    if (!passwordOk)
      return reply.code(401).send({ error: "Mot de passe incorrect" });
    const counter = verifyTotp(state.totpSecret, code);
    if (counter === null || counter <= (state.totpLastCounter ?? -1)) {
      return reply.code(400).send({ error: "Code 2FA invalide" });
    }
    await store.setTotp(undefined);
    return { ok: true, totpEnabled: false };
  });
}
