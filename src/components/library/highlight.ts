/** A small TSX highlighter: enough colour to read component source, no parser or dependency. */

export type TokenKind = "plain" | "comment" | "string" | "keyword" | "number" | "tag" | "attr" | "fn" | "type" | "punct";
export interface Token { kind: TokenKind; text: string }

const KEYWORDS = "import|export|from|default|const|let|var|function|return|if|else|for|while|do|of|in|new|type|interface|extends|implements|as|async|await|try|catch|finally|throw|typeof|keyof|instanceof|null|undefined|true|false|this|class|switch|case|break|continue|void|satisfies";

// Order matters: comments and strings first so nothing inside them is coloured again.
const PATTERN = new RegExp([
  String.raw`(\/\*[\s\S]*?\*\/|\/\/[^\n]*)`, // 1 comment
  String.raw`(\x60(?:\\[\s\S]|[^\x60\\])*\x60|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')`, // 2 string
  String.raw`(<\/?)([A-Za-z][\w.]*)`, // 3 bracket, 4 tag name
  String.raw`\b(${KEYWORDS})\b`, // 5 keyword
  String.raw`\b(\d[\d_]*(?:\.\d+)?)\b`, // 6 number
  String.raw`([A-Za-z_$][\w$-]*)(?==[{"'\x60])`, // 7 JSX attribute
  String.raw`([A-Za-z_$][\w$]*)(?=\s*\()`, // 8 call
  String.raw`\b([A-Z][\w$]*)\b`, // 9 type or component
  String.raw`((?:(?!<\/?[A-Za-z])[{}()[\];,.=<>/?:!&|+*%-])+)`, // 10 punctuation, stopping before a tag
].join("|"), "g");

export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  const push = (kind: TokenKind, text: string) => { if (text) tokens.push({ kind, text }); };
  for (const match of code.matchAll(PATTERN)) {
    push("plain", code.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[1]) push("comment", match[1]);
    else if (match[2]) push("string", match[2]);
    else if (match[4]) { push("punct", match[3]); push(/^[A-Z]/.test(match[4]) ? "type" : "tag", match[4]); }
    else if (match[5]) push("keyword", match[5]);
    else if (match[6]) push("number", match[6]);
    else if (match[7]) push("attr", match[7]);
    else if (match[8]) push("fn", match[8]);
    else if (match[9]) push("type", match[9]);
    else push("punct", match[0]);
  }
  push("plain", code.slice(last));
  return tokens;
}

/** Tokens split into lines, so multi-line comments and template strings keep their colour on every line. */
export function highlightLines(code: string): Token[][] {
  const lines: Token[][] = [[]];
  for (const token of tokenize(code)) {
    token.text.split("\n").forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ kind: token.kind, text: part });
    });
  }
  return lines;
}

export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "text-[hsl(var(--syn-plain))]",
  comment: "italic text-[hsl(var(--syn-comment))]",
  string: "text-[hsl(var(--syn-string))]",
  keyword: "text-[hsl(var(--syn-keyword))]",
  number: "text-[hsl(var(--syn-number))]",
  tag: "text-[hsl(var(--syn-tag))]",
  attr: "text-[hsl(var(--syn-attr))]",
  fn: "text-[hsl(var(--syn-fn))]",
  type: "text-[hsl(var(--syn-type))]",
  punct: "text-[hsl(var(--syn-punct))]",
};
