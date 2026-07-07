import { splitWordForEmphasis } from '../lib/frontLoadedEmphasis';

// Renders text with front-loaded emphasis: the leading ~40% of each word's
// characters rendered bold, the rest plain. Never call this "Bionic
// Reading" anywhere - see CLAUDE.md.
export function FrontLoadedText({ text }) {
  const tokens = text.split(/(\s+)/);

  return tokens.map((token, i) => {
    if (token === '' || /^\s+$/.test(token)) {
      return token;
    }
    const { bold, rest } = splitWordForEmphasis(token);
    return (
      <span key={i}>
        {bold && <strong>{bold}</strong>}
        {rest}
      </span>
    );
  });
}
