// Çok küçük, dil-genel sözdizimi renklendirici (React düğümleri döndürür).
import React, { ReactNode } from 'react';

const KW = new Set(
  (
    'const let var function return if else for while do switch case break continue new class extends import from export default ' +
    'async await try catch finally throw typeof instanceof in of this super null undefined true false void yield static public private ' +
    'protected interface type enum implements def lambda pass elif except raise with as is not and or None True False self print fn mut ' +
    'pub struct impl use mod match loop package func go defer chan select range map string int bool float double char long short unsigned ' +
    'include define using namespace template auto virtual override echo local then end elseif nil require'
  ).split(' '),
);

const TOKEN = /(\/\/[^\n]*|#(?![\w{])[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d[\d_.]*(?:e[+-]?\d+)?[a-z]*\b|\b0x[\da-f]+\b)|([A-Za-z_$][\w$]*)|([{}()[\];,.:<>=+\-*/%!&|^~?@]+)/gi;

const LISP_LIKE = new Set(['json', 'yaml', 'yml', 'md', 'markdown', 'txt', 'text', '']);

export function highlight(code: string, lang: string): ReactNode {
  const l = lang.toLowerCase();
  if (code.length > 20000 || (LISP_LIKE.has(l) && l !== 'json')) return code;
  const hashComments = ['py', 'python', 'sh', 'bash', 'rb', 'ruby', 'yaml', 'yml', 'ps1', 'powershell', 'toml'].includes(l);
  const dashComments = ['lua', 'sql', 'hs'].includes(l);
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(code))) {
    if (m.index > last) out.push(code.slice(last, m.index));
    const [tok, com, str, num, word, punc] = m;
    if (com) {
      const isHash = com.startsWith('#'), isDash = com.startsWith('--');
      if ((isHash && !hashComments) || (isDash && !dashComments)) {
        // yorum değil: yalnızca ilk karakteri tüket
        out.push(com[0]);
        TOKEN.lastIndex = m.index + 1;
        last = m.index + 1;
        continue;
      }
      out.push(<span key={k++} className="hl-c">{tok}</span>);
    } else if (str) out.push(<span key={k++} className="hl-s">{tok}</span>);
    else if (num) out.push(<span key={k++} className="hl-n">{tok}</span>);
    else if (word) {
      if (KW.has(word)) out.push(<span key={k++} className="hl-k">{tok}</span>);
      else if (code[m.index + tok.length] === '(') out.push(<span key={k++} className="hl-f">{tok}</span>);
      else if (/^[A-Z]/.test(word)) out.push(<span key={k++} className="hl-t">{tok}</span>);
      else out.push(tok);
    } else if (punc) out.push(<span key={k++} className="hl-p">{tok}</span>);
    else out.push(tok);
    last = m.index + tok.length;
  }
  if (last < code.length) out.push(code.slice(last));
  return out;
}
