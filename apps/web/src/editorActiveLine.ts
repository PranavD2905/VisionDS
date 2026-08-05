import {
  Decoration,
  EditorView,
  StateEffect,
  StateField,
  type DecorationSet,
  type Extension,
} from '@uiw/react-codemirror';

/**
 * Playback highlight for the editor.
 *
 * Merging the workbench into one screen means the editor is also the code
 * panel: it stays editable, and during playback the step's line is marked in
 * place. That removes the second, read-only copy of the source entirely.
 *
 * The highlight is a CodeMirror decoration rather than an overlay so it tracks
 * the real line geometry — wrapping, folds and scroll included.
 */

export interface ActiveLine {
  /** 1-based line number, or null to clear. */
  line: number | null;
  /** Exception steps mark in the failure color instead of the accent. */
  isException?: boolean;
}

export const setActiveLine = StateEffect.define<ActiveLine>();

const lineMark = Decoration.line({ class: 'cm-step-line' });
const exceptionMark = Decoration.line({ class: 'cm-step-line cm-step-line-error' });

const activeLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    // map through edits so the mark survives typing until the next dispatch
    let next = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (!effect.is(setActiveLine)) continue;
      const { line, isException } = effect.value;
      if (line === null || line < 1 || line > tr.state.doc.lines) {
        next = Decoration.none;
        continue;
      }
      const from = tr.state.doc.line(line).from;
      next = Decoration.set([(isException ? exceptionMark : lineMark).range(from)]);
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const activeLineExtension: Extension = [activeLineField];

/**
 * Point the highlight at a line and scroll it into view. Safe to call with a
 * null view (the editor may not be mounted yet) or an out-of-range line (the
 * source can be edited after a run).
 */
export function showActiveLine(view: EditorView | null | undefined, active: ActiveLine): void {
  if (!view) return;
  const effects: StateEffect<unknown>[] = [setActiveLine.of(active)];
  if (active.line !== null && active.line >= 1 && active.line <= view.state.doc.lines) {
    effects.push(
      EditorView.scrollIntoView(view.state.doc.line(active.line).from, { y: 'nearest' }),
    );
  }
  view.dispatch({ effects });
}
