// Escapes text placed in HTML, as an element's text or an attribute's value, e.g. visitor input in the hosts' meeting email
// or the MCP sign-in pages
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!)
}
