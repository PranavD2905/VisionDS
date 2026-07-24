import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import { EditorView } from '@uiw/react-codemirror';

/**
 * CATHODE-83 editor theme.
 *
 * CodeMirror's stock dark theme is a cold blue-black with a six-hue token
 * palette — wrong machine entirely. This is a three-phosphor scheme: amber for
 * syntax, green for literals, cream for the things you named yourself. Colors
 * are hard-coded rather than read from CSS variables because CodeMirror builds
 * its stylesheet once, outside the cascade we control.
 */
const AMBER = '#ffae2b';
const AMBER_DIM = '#d99327';
const CREAM = '#f3e9d8';
const GREEN = '#5bd97f';
const MUTED = '#8a806f';
const CYAN = '#5ec8ff';

export const cathodeTheme = EditorView.theme(
  {
    '&': { color: CREAM, backgroundColor: '#121110' },
    '.cm-content': { caretColor: AMBER },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: AMBER, borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(255, 174, 43, 0.22)',
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255, 174, 43, 0.07)' },
    '.cm-gutters': {
      backgroundColor: '#121110',
      color: '#6f6759',
      border: 'none',
      borderRight: '1px solid #2e2a26',
    },
    '.cm-activeLineGutter': { backgroundColor: 'rgba(255, 174, 43, 0.07)', color: AMBER },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
      backgroundColor: 'rgba(255, 174, 43, 0.2)',
      outline: 'none',
      color: CREAM,
    },
    '.cm-selectionMatch': { backgroundColor: 'rgba(255, 174, 43, 0.12)' },
    '.cm-foldPlaceholder': { backgroundColor: 'transparent', border: 'none', color: MUTED },
    '.cm-tooltip': { backgroundColor: '#1a1817', border: '1px solid #46403a', color: CREAM },
  },
  { dark: true },
);

export const cathodeHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword], color: AMBER, fontWeight: '600' },
  { tag: [t.definitionKeyword, t.operatorKeyword], color: AMBER },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: CREAM, fontWeight: '600' },
  { tag: [t.definition(t.variableName), t.definition(t.propertyName)], color: CREAM },
  { tag: [t.variableName, t.propertyName, t.attributeName], color: CREAM },
  { tag: [t.className, t.typeName, t.namespace], color: '#ffcb6b' },
  { tag: [t.string, t.special(t.string), t.regexp], color: GREEN },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#ffd166' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: MUTED, fontStyle: 'italic' },
  { tag: [t.operator, t.punctuation, t.bracket, t.separator], color: '#a99c88' },
  { tag: [t.meta, t.annotation], color: CYAN },
  { tag: t.self, color: AMBER_DIM },
  { tag: t.invalid, color: '#ff6a55' },
  { tag: t.link, color: CYAN, textDecoration: 'underline' },
  { tag: [t.heading, t.strong], color: CREAM, fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic' },
]);

/** Drop-in `extensions` entry — pair with `theme="none"` on the editor. */
export const cathodeEditor = [cathodeTheme, syntaxHighlighting(cathodeHighlight)];
