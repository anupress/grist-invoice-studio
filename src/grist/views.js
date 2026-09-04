// Whether a column can be seen on its page.
//
// Grist keeps two things apart that a person sees as one: a column, which lives in the table, and
// a field, which is that column's place in a particular view of it. Every page is a view, and the
// raw data view is another. `AddColumn` makes the column and a field in the raw data view only;
// `AddVisibleColumn` — the action Grist's own "+" button and its REST API use — makes the column
// and a field in every page that shows the table.
//
// This widget used the first for years. So the Image column it added to a catalogue existed, and
// held the pictures, and rendered them on every invoice — and the Products page, the one place a
// person looks, showed no such column. The fix for new columns is one word. The fix for a column
// already there is here: read the view metadata, find every page that shows the table without a
// field for that column, and add one, which is exactly what AddVisibleColumn would have done.
//
// Pure functions over plain rows, so the decision is testable; the one reader is at the bottom.

/** A Grist column-oriented table (`{id:[...], colA:[...]}`) as rows. */
function rowsOf(table) {
  const ids = table?.id || [];
  return ids.map((id, i) => Object.fromEntries(Object.keys(table).map((k) => [k, table[k][i]])));
}

/**
 * Metadata in the shape the functions below read.
 *
 * `tables`, `columns`, `sections`, `fields` are the four meta tables as arrays of rows, each row
 * carrying only the properties this file consults. Anything a future Grist adds is ignored.
 */
export function viewMeta({ tables, columns, sections, fields }) {
  return {
    tables: rowsOf(tables).map((r) => ({ id: r.id, tableId: r.tableId, rawViewSectionRef: r.rawViewSectionRef || 0 })),
    columns: rowsOf(columns).map((r) => ({ id: r.id, parentId: r.parentId, colId: r.colId })),
    sections: rowsOf(sections).map((r) => ({ id: r.id, tableRef: r.tableRef, parentId: r.parentId || 0, parentKey: r.parentKey })),
    fields: rowsOf(fields).map((r) => ({ id: r.id, parentId: r.parentId, colRef: r.colRef, parentPos: Number(r.parentPos) || 0 })),
  };
}

/**
 * The page sections that show a table as a grid.
 *
 * `record` is Grist's word for a grid; a card, chart or form is a different kind of view with its
 * own field list, and a column absent from a chart is not hidden, it is simply not plotted. The
 * raw data section belongs to no page and is skipped by both tests, because a column is always
 * in it.
 */
function gridSections(meta, table) {
  return meta.sections.filter((s) =>
    s.tableRef === table.id && s.parentKey === 'record' && s.parentId !== 0 && s.id !== table.rawViewSectionRef);
}

/**
 * Which of `wanted` (`[{table, id}]`) exist but are missing from at least one page of their table.
 *
 * Returns `[{table, id, colRef, sections: [sectionId, ...]}]`, one per column, with the sections
 * that lack it. A column not in the table at all is not hidden, it is absent, and belongs to the
 * upgrade rather than here. A table with no pages has nothing to be hidden from.
 */
export function hiddenColumns(meta, wanted) {
  const out = [];
  for (const w of wanted || []) {
    const table = meta.tables.find((t) => t.tableId === w.table);
    if (!table) continue;
    const col = meta.columns.find((c) => c.parentId === table.id && c.colId === w.id);
    if (!col) continue;
    const missing = gridSections(meta, table)
      .filter((s) => !meta.fields.some((f) => f.parentId === s.id && f.colRef === col.id))
      .map((s) => s.id);
    if (missing.length) out.push({ table: w.table, id: w.id, colRef: col.id, sections: missing });
  }
  return out;
}

/**
 * The actions that put each hidden column on each page it is missing from.
 *
 * A field is a row in `_grist_Views_section_field`: which section, which column, and a position.
 * The position goes after the last field the section has, so the column appears at the right of
 * the grid the way a newly added one does, never in the middle of an arrangement somebody made.
 */
export function revealActions(meta, hidden) {
  const actions = [];
  for (const h of hidden || []) {
    for (const sectionId of h.sections) {
      const last = meta.fields.filter((f) => f.parentId === sectionId).reduce((m, f) => Math.max(m, f.parentPos), 0);
      actions.push(['AddRecord', '_grist_Views_section_field', null, { parentId: sectionId, colRef: h.colRef, parentPos: last + 1 }]);
    }
  }
  return actions;
}

// ---------------------------------------------------------------------------------------------
// Reading it from a live document
// ---------------------------------------------------------------------------------------------

const g = () => (typeof window !== 'undefined' ? window.grist : undefined);
let cached = null;

/** Forget what was read, after anything that could have changed it. */
export function forgetViewMeta() { cached = null; }

/**
 * The four meta tables, read once per session and after every change this widget makes.
 *
 * Meta tables need full access, which every caller has already established. A read that fails
 * for any other reason resolves to null: not knowing whether a column is hidden costs one line of
 * advice, and must never cost the document.
 */
export function readViewMeta() {
  if (cached) return cached;
  cached = (async () => {
    try {
      const api = g()?.docApi;
      if (!api) return null;
      const [tables, columns, sections, fields] = await Promise.all([
        api.fetchTable('_grist_Tables'),
        api.fetchTable('_grist_Tables_column'),
        api.fetchTable('_grist_Views_section'),
        api.fetchTable('_grist_Views_section_field'),
      ]);
      return viewMeta({ tables, columns, sections, fields });
    } catch (e) {
      console.warn('[Invoice Studio] the page layout could not be read — hidden columns will not be reported', e);
      cached = null;
      return null;
    }
  })();
  return cached;
}
