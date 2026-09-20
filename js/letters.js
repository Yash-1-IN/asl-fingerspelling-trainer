// The 24 static ASL fingerspelling letters. J and Z are left out because they
// need motion; version 1 only recognises still handshapes.
export const LETTERS = 'ABCDEFGHIKLMNOPQRSTUVWXY'.split('');

// A 25th class: a hand is visible but it is not signing a letter (relaxed hand,
// waving, moving between letters). Lets the model say "none of these".
export const NO_SIGN = 'none';

// Everything the model can output, in order.
export const CLASSES = [...LETTERS, NO_SIGN];

export const labelOf = (cls) => (cls === NO_SIGN ? 'No sign' : cls);
