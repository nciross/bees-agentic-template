/** Skill folders copied verbatim under `base/<skill>/`. */
export const skillFiles = (packs, base) =>
  packs.flatMap((p) => p.skills.flatMap((s) => s.files.map((f) => ({ path: `${base}/${s.name}/${f.rel}`, content: f.content }))));
