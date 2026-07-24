import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { EditorView, type Extension } from '@uiw/react-codemirror';
import { token, tokenAlpha } from './theme/tokens';

/**
 * Editor theme, derived from the semantic layer.
 *
 * CodeMirror compiles its own stylesheet, so it cannot read `var(--token)` the
 * way the rest of the app does. Instead it resolves the same semantic tokens at
 * build time through `theme/tokens.ts` — the editor depends on the theme
 * contract, not on any particular palette. Retheming the app rethemes the
 * editor with it.
 *
 * Built lazily and cached: the tokens only resolve once the stylesheet is in
 * the document, which is after module evaluation but before first render.
 */
let cached: Extension[] | null = null;

function build(): Extension[] {
  const bg = token('--editor-bg');
  const text = token('--editor-text');
  const accent = token('--accent');
  const accentWash = tokenAlpha('--accent', 0.08);
  const selection = tokenAlpha('--accent', 0.22);

  const theme = EditorView.theme(
    {
      '&': { color: text, backgroundColor: bg },
      '.cm-content': { caretColor: accent },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: accent, borderLeftWidth: '2px' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
        backgroundColor: selection,
      },
      '.cm-activeLine': { backgroundColor: accentWash },
      '.cm-gutters': {
        backgroundColor: bg,
        color: token('--editor-gutter'),
        border: 'none',
        borderRight: `1px solid ${token('--border')}`,
      },
      '.cm-activeLineGutter': { backgroundColor: accentWash, color: accent },
      '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
        backgroundColor: tokenAlpha('--accent', 0.2),
        outline: 'none',
        color: text,
      },
      '.cm-selectionMatch': { backgroundColor: tokenAlpha('--accent', 0.12) },
      '.cm-foldPlaceholder': {
        backgroundColor: 'transparent',
        border: 'none',
        color: token('--muted'),
      },
      '.cm-tooltip': {
        backgroundColor: token('--panel-2'),
        border: `1px solid ${token('--border-strong')}`,
        color: text,
      },
    },
    { dark: true },
  );

  /* Three roles carry the syntax: accent for the language's own words, string
     and number for literals, and plain text for the things you named. */
  const highlight = HighlightStyle.define([
    { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: token('--editor-keyword'), fontWeight: '600' },
    { tag: [t.definitionKeyword, t.operatorKeyword], color: token('--editor-keyword') },
    { tag: [t.function(t.variableName), t.function(t.propertyName)], color: token('--editor-entity'), fontWeight: '600' },
    { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: token('--editor-entity') },
    { tag: [t.variableName, t.propertyName, t.attributeName], color: token('--editor-entity') },
    { tag: [t.className, t.typeName, t.namespace], color: token('--editor-type') },
    { tag: [t.string, t.special(t.string), t.regexp], color: token('--editor-string') },
    { tag: [t.number, t.bool, t.null, t.atom], color: token('--editor-number') },
    { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: token('--editor-comment'), fontStyle: 'italic' },
    { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: token('--editor-operator') },
    { tag: [t.meta, t.annotation], color: token('--editor-meta') },
    { tag: t.self, color: token('--editor-keyword') },
    { tag: t.invalid, color: token('--editor-invalid') },
    { tag: t.link, color: token('--editor-meta'), textDecoration: 'underline' },
    { tag: [t.heading, t.strong], color: token('--editor-entity'), fontWeight: '700' },
    { tag: t.emphasis, fontStyle: 'italic' },
  ]);

  return [theme, syntaxHighlighting(highlight)];
}

/** Drop-in `extensions` entry — pair with `theme="none"` on the editor. */
export function editorTheme(): Extension[] {
  if (!cached) cached = build();
  return cached;
}
