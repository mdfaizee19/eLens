const EMPHASIS_RATIO = 0.4;
const MIN_WORD_LENGTH_FOR_EMPHASIS = 4; // words of length <= 3 are left plain

// Splits a single word into the front-loaded bold prefix and the plain
// remainder. Words of length <= 3 get no emphasis at all (returned as the
// "rest" half with an empty bold half) - too short for a partial-bold
// prefix to read as anything but noise.
export function splitWordForEmphasis(word) {
  if (word.length < MIN_WORD_LENGTH_FOR_EMPHASIS) {
    return { bold: '', rest: word };
  }
  const boldLength = Math.ceil(word.length * EMPHASIS_RATIO);
  return { bold: word.slice(0, boldLength), rest: word.slice(boldLength) };
}
