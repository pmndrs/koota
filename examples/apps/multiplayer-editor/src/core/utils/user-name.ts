function randomInt(maxExclusive: number) {
    if (maxExclusive <= 0) return 0;
    if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        return buf[0] % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
}

const ADJECTIVES = [
    'Brave',
    'Calm',
    'Clever',
    'Curious',
    'Daring',
    'Gentle',
    'Happy',
    'Jolly',
    'Kind',
    'Lucky',
    'Mighty',
    'Nimble',
    'Quiet',
    'Silly',
    'Swift',
    'Witty',
];

const NOUNS = [
    'Badger',
    'Bear',
    'Cat',
    'Deer',
    'Dolphin',
    'Eagle',
    'Fox',
    'Hedgehog',
    'Koala',
    'Lynx',
    'Otter',
    'Panda',
    'Raven',
    'Tiger',
    'Turtle',
    'Wolf',
];

export function createRandomUserName() {
    const adj = ADJECTIVES[randomInt(ADJECTIVES.length)];
    const noun = NOUNS[randomInt(NOUNS.length)];
    const num = randomInt(100);
    return `${adj} ${noun} ${String(num).padStart(2, '0')}`;
}
