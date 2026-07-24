import type { ReactNode } from 'react';
import { getDemo } from './demos/registry';
import type { SpecimenSpec, SpecimenTagSpec } from './types';

/**
 * The catalogue frame.
 *
 * Its single responsibility is presenting *something* as a specimen: hairline
 * box, stamped tag, and a tabular footer that indexes it. It never knows what
 * it contains — children, or a demo resolved by id — so adding a new kind of
 * exhibit requires no change here.
 */

export function SpecimenTag({ label, glyph }: SpecimenTagSpec) {
  return (
    <span className="spec-tag">
      {glyph && (
        <span className="spec-tag-glyph" aria-hidden="true">
          {glyph}
        </span>
      )}
      {label}
    </span>
  );
}

export function SpecimenFooter({
  kind,
  index,
  title,
  status,
}: Pick<SpecimenSpec, 'kind' | 'index' | 'title' | 'status'>) {
  return (
    <div className="spec-foot">
      <span className="spec-foot-cell spec-foot-kind">{kind}</span>
      <span className="spec-foot-cell spec-foot-index">{index}</span>
      <span className="spec-foot-cell spec-foot-title">{title}</span>
      {status && <span className="spec-foot-cell spec-foot-status">{status}</span>}
    </div>
  );
}

export function Specimen({
  spec,
  children,
}: {
  spec: SpecimenSpec;
  /** Overrides the registry lookup — used for one-off exhibits. */
  children?: ReactNode;
}) {
  const Demo = spec.demo ? getDemo(spec.demo) : null;

  return (
    <article className="spec">
      <div className="spec-body">
        <SpecimenTag {...spec.tag} />
        <div className="spec-stage">{children ?? (Demo ? <Demo /> : null)}</div>
        {spec.note && <p className="spec-note">{spec.note}</p>}
      </div>
      <SpecimenFooter
        kind={spec.kind}
        index={spec.index}
        title={spec.title}
        status={spec.status}
      />
    </article>
  );
}

/** A catalogue: the grid every specimen sits in. */
export function SpecimenGrid({ children }: { children: ReactNode }) {
  return <div className="spec-grid">{children}</div>;
}
