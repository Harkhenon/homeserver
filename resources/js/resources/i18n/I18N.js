import strings from './strings.json';

export const say = (string, lang) => {
    return strings[lang][string];
}