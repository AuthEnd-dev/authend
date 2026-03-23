import { Fragment } from 'react';
import { cn } from '../../lib/utils';

type CodeLanguage = 'ts' | 'tsx' | 'js' | 'json' | 'bash' | 'http' | 'sql';

type TokenKind =
  | 'plain'
  | 'comment'
  | 'string'
  | 'number'
  | 'keyword'
  | 'boolean'
  | 'property'
  | 'operator'
  | 'function'
  | 'punctuation';

type Token = {
  kind: TokenKind;
  value: string;
};

type CodeBlockProps = {
  code: string;
  language: CodeLanguage;
  className?: string;
};

const SHARED_KEYWORDS = new Set([
  'await',
  'async',
  'return',
  'const',
  'let',
  'var',
  'if',
  'else',
  'switch',
  'case',
  'break',
  'continue',
  'for',
  'while',
  'do',
  'try',
  'catch',
  'finally',
  'throw',
  'new',
  'import',
  'from',
  'export',
  'default',
  'function',
  'class',
  'extends',
  'implements',
  'type',
  'interface',
  'typeof',
  'instanceof',
  'in',
  'of',
  'as',
]);

const SCRIPT_KEYWORDS = new Set([...SHARED_KEYWORDS, 'true', 'false', 'null', 'undefined']);
const SHELL_KEYWORDS = new Set(['if', 'then', 'else', 'fi', 'for', 'do', 'done', 'case', 'esac', 'function', 'export']);
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const SQL_KEYWORDS = new Set([
  'select',
  'from',
  'where',
  'and',
  'or',
  'insert',
  'into',
  'values',
  'update',
  'delete',
  'alter',
  'table',
  'create',
  'drop',
  'join',
  'left',
  'right',
  'inner',
  'outer',
  'full',
  'on',
  'group',
  'by',
  'order',
  'limit',
  'offset',
  'returning',
  'set',
  'null',
  'not',
  'primary',
  'key',
  'default',
  'references',
  'cascade',
  'restrict',
  'as',
  'if',
  'exists',
]);

function pushPlain(tokens: Token[], value: string) {
  if (!value) {
    return;
  }
  const previous = tokens[tokens.length - 1];
  if (previous && previous.kind === 'plain') {
    previous.value += value;
    return;
  }
  tokens.push({ kind: 'plain', value });
}

function tokenClassName(kind: TokenKind) {
  switch (kind) {
    case 'comment':
      return 'text-zinc-500 dark:text-zinc-400';
    case 'string':
      return 'text-emerald-700 dark:text-emerald-300';
    case 'number':
      return 'text-violet-700 dark:text-violet-300';
    case 'keyword':
      return 'text-sky-700 dark:text-sky-300';
    case 'boolean':
      return 'text-fuchsia-700 dark:text-fuchsia-300';
    case 'property':
      return 'text-amber-700 dark:text-amber-300';
    case 'operator':
      return 'text-rose-700 dark:text-rose-300';
    case 'function':
      return 'text-cyan-700 dark:text-cyan-300';
    case 'punctuation':
      return 'text-muted-foreground';
    default:
      return 'text-foreground';
  }
}

function consumeString(line: string, start: number, quote: string) {
  let cursor = start + 1;
  let escaped = false;
  while (cursor < line.length) {
    const char = line[cursor];
    if (escaped) {
      escaped = false;
      cursor += 1;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      cursor += 1;
      continue;
    }
    if (char === quote) {
      cursor += 1;
      break;
    }
    cursor += 1;
  }
  return line.slice(start, cursor);
}

function tokenizeScriptLine(line: string) {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    const rest = line.slice(cursor);

    if (rest.startsWith('//')) {
      tokens.push({ kind: 'comment', value: rest });
      break;
    }

    if (rest.startsWith('/*')) {
      const end = line.indexOf('*/', cursor + 2);
      const value = end === -1 ? line.slice(cursor) : line.slice(cursor, end + 2);
      tokens.push({ kind: 'comment', value });
      cursor += value.length;
      continue;
    }

    const char = line[cursor];
    if (char === '"' || char === '\'' || char === '`') {
      const value = consumeString(line, cursor, char);
      tokens.push({ kind: 'string', value });
      cursor += value.length;
      continue;
    }

    const propertyMatch = rest.match(/^([A-Za-z_$][\w$]*)(?=\s*:)/);
    if (propertyMatch) {
      tokens.push({ kind: 'property', value: propertyMatch[1] });
      cursor += propertyMatch[1].length;
      continue;
    }

    const functionMatch = rest.match(/^([A-Za-z_$][\w$]*)(?=\()/);
    if (functionMatch && !SCRIPT_KEYWORDS.has(functionMatch[1])) {
      tokens.push({ kind: 'function', value: functionMatch[1] });
      cursor += functionMatch[1].length;
      continue;
    }

    const keywordMatch = rest.match(/^[A-Za-z_$][\w$]*/);
    if (keywordMatch) {
      const value = keywordMatch[0];
      if (value === 'true' || value === 'false' || value === 'null' || value === 'undefined') {
        tokens.push({ kind: 'boolean', value });
      } else if (SCRIPT_KEYWORDS.has(value)) {
        tokens.push({ kind: 'keyword', value });
      } else {
        pushPlain(tokens, value);
      }
      cursor += value.length;
      continue;
    }

    const numberMatch = rest.match(/^-?\d+(?:\.\d+)?/);
    if (numberMatch) {
      tokens.push({ kind: 'number', value: numberMatch[0] });
      cursor += numberMatch[0].length;
      continue;
    }

    const operatorMatch = rest.match(/^(=>|===|!==|==|!=|<=|>=|\+\+|--|\|\||&&|[=+\-*/%<>!?:])/);
    if (operatorMatch) {
      tokens.push({ kind: 'operator', value: operatorMatch[0] });
      cursor += operatorMatch[0].length;
      continue;
    }

    if (/^[()[\]{}.,;]$/.test(char)) {
      tokens.push({ kind: 'punctuation', value: char });
      cursor += 1;
      continue;
    }

    pushPlain(tokens, char);
    cursor += 1;
  }

  return tokens;
}

function tokenizeJsonLine(line: string) {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    const rest = line.slice(cursor);

    const propertyMatch = rest.match(/^"([^"\\]|\\.)*"(?=\s*:)/);
    if (propertyMatch) {
      tokens.push({ kind: 'property', value: propertyMatch[0] });
      cursor += propertyMatch[0].length;
      continue;
    }

    if (rest.startsWith('"')) {
      const value = consumeString(line, cursor, '"');
      tokens.push({ kind: 'string', value });
      cursor += value.length;
      continue;
    }

    const keywordMatch = rest.match(/^(true|false|null)\b/);
    if (keywordMatch) {
      tokens.push({ kind: 'boolean', value: keywordMatch[0] });
      cursor += keywordMatch[0].length;
      continue;
    }

    const numberMatch = rest.match(/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/i);
    if (numberMatch) {
      tokens.push({ kind: 'number', value: numberMatch[0] });
      cursor += numberMatch[0].length;
      continue;
    }

    if (/^[:{},[\]]/.test(rest)) {
      tokens.push({ kind: 'punctuation', value: rest[0] });
      cursor += 1;
      continue;
    }

    pushPlain(tokens, line[cursor]);
    cursor += 1;
  }

  return tokens;
}

function tokenizeBashLine(line: string) {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    const rest = line.slice(cursor);

    if (rest.startsWith('#')) {
      tokens.push({ kind: 'comment', value: rest });
      break;
    }

    const char = line[cursor];
    if (char === '"' || char === '\'') {
      const value = consumeString(line, cursor, char);
      tokens.push({ kind: 'string', value });
      cursor += value.length;
      continue;
    }

    const variableMatch = rest.match(/^\$[{(]?[A-Za-z_][\w]*[)}]?/);
    if (variableMatch) {
      tokens.push({ kind: 'property', value: variableMatch[0] });
      cursor += variableMatch[0].length;
      continue;
    }

    const wordMatch = rest.match(/^[A-Za-z_][\w-]*/);
    if (wordMatch) {
      const value = wordMatch[0];
      if (SHELL_KEYWORDS.has(value)) {
        tokens.push({ kind: 'keyword', value });
      } else {
        pushPlain(tokens, value);
      }
      cursor += value.length;
      continue;
    }

    const numberMatch = rest.match(/^\d+/);
    if (numberMatch) {
      tokens.push({ kind: 'number', value: numberMatch[0] });
      cursor += numberMatch[0].length;
      continue;
    }

    const operatorMatch = rest.match(/^(\|\||&&|>>|<<|[|><=])/);
    if (operatorMatch) {
      tokens.push({ kind: 'operator', value: operatorMatch[0] });
      cursor += operatorMatch[0].length;
      continue;
    }

    pushPlain(tokens, char);
    cursor += 1;
  }

  return tokens;
}

function tokenizeHttpLine(line: string, index: number) {
  if (index === 0) {
    const methodMatch = line.match(/^[A-Z]+/);
    if (methodMatch && HTTP_METHODS.has(methodMatch[0])) {
      const rest = line.slice(methodMatch[0].length);
      return [
        { kind: 'keyword', value: methodMatch[0] },
        { kind: 'plain', value: rest },
      ] satisfies Token[];
    }
  }

  const headerMatch = line.match(/^([A-Za-z-]+)(:)(.*)$/);
  if (headerMatch) {
    return [
      { kind: 'property', value: headerMatch[1] },
      { kind: 'punctuation', value: headerMatch[2] },
      { kind: 'plain', value: headerMatch[3] },
    ];
  }

  return tokenizeJsonLine(line);
}

function tokenizeSqlLine(line: string) {
  const tokens: Token[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    const rest = line.slice(cursor);

    if (rest.startsWith('--')) {
      tokens.push({ kind: 'comment', value: rest });
      break;
    }

    const char = line[cursor];
    if (char === '"' || char === '\'') {
      const value = consumeString(line, cursor, char);
      tokens.push({ kind: 'string', value });
      cursor += value.length;
      continue;
    }

    const keywordMatch = rest.match(/^[A-Za-z_][\w$]*/);
    if (keywordMatch) {
      const value = keywordMatch[0];
      if (SQL_KEYWORDS.has(value.toLowerCase())) {
        tokens.push({ kind: 'keyword', value });
      } else {
        pushPlain(tokens, value);
      }
      cursor += value.length;
      continue;
    }

    const numberMatch = rest.match(/^-?\d+(?:\.\d+)?/);
    if (numberMatch) {
      tokens.push({ kind: 'number', value: numberMatch[0] });
      cursor += numberMatch[0].length;
      continue;
    }

    const operatorMatch = rest.match(/^(::|<=|>=|<>|!=|[=+\-*/%<>])/);
    if (operatorMatch) {
      tokens.push({ kind: 'operator', value: operatorMatch[0] });
      cursor += operatorMatch[0].length;
      continue;
    }

    if (/^[()[\]{}.,;]$/.test(char)) {
      tokens.push({ kind: 'punctuation', value: char });
      cursor += 1;
      continue;
    }

    pushPlain(tokens, char);
    cursor += 1;
  }

  return tokens;
}

function tokenizeLine(line: string, language: CodeLanguage, index: number) {
  switch (language) {
    case 'json':
      return tokenizeJsonLine(line);
    case 'bash':
      return tokenizeBashLine(line);
    case 'http':
      return tokenizeHttpLine(line, index);
    case 'sql':
      return tokenizeSqlLine(line);
    case 'ts':
    case 'tsx':
    case 'js':
    default:
      return tokenizeScriptLine(line);
  }
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const lines = code.replace(/\r\n/g, '\n').split('\n');

  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-md border border-border/70 bg-zinc-50 px-0 py-0 text-xs leading-relaxed shadow-sm dark:bg-zinc-950',
        className,
      )}
    >
      <code className="block min-w-full font-mono">
        {lines.map((line, index) => {
          const tokens = tokenizeLine(line, language, index);
          return (
            <div
              key={`${index}-${line}`}
              className="grid min-h-6 grid-cols-[auto_1fr] border-b border-border/40 last:border-b-0"
            >
              <span className="select-none border-r border-border/40 px-3 py-1 text-right text-[10px] text-muted-foreground">
                {index + 1}
              </span>
              <span className="px-3 py-1 whitespace-pre">
                {tokens.length === 0 ? ' ' : tokens.map((token, tokenIndex) => (
                  <Fragment key={`${index}-${tokenIndex}`}>
                    <span className={tokenClassName(token.kind as TokenKind)}>{token.value}</span>
                  </Fragment>
                ))}
              </span>
            </div>
          );
        })}
      </code>
    </pre>
  );
}
