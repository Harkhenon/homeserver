import asyncio, sys, os, json
from websockets.asyncio.client import connect

def constructUrl():
   url = sys.argv[2]
   port = sys.argv[3]
   uri = sys.argv[4]

   return "wss://" + url + ":" + port + uri

async def hello():
    async with connect(constructUrl()) as websocket:
        await websocket.send(sys.argv[1])
        message = await websocket.recv()
        print(message)


if __name__ == "__main__":
  asyncio.run(hello())
