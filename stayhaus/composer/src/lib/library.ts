/**
 * Find a component in the team library by name pattern.
 * Master template components must be named: "<flow>/<section>/<variant>"
 * e.g., "welcome/hero/v2"
 *
 * Designer must drag at least one instance of each component into the
 * file once so it's "imported" — Figma plugins can only resolve components
 * already known to the file. (Phase 2b will switch to the team library API
 * once we have a Figma access token.)
 */
export async function findComponent(
  flow: string,
  section: string,
  variant: string
): Promise<ComponentNode | null> {
  const targetName = `${flow}/${section}/${variant}`;
  const all = figma.root.findAllWithCriteria({ types: ['COMPONENT'] });
  for (const node of all) {
    if (node.name === targetName) return node as ComponentNode;
  }
  return null;
}
