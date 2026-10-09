// Node-info content builder (FACTORY-957 item 2's "showTooltip builds HTML as a pure function of
// datum `d`, separate from cursor positioning — split those so hover and the new panel call the
// same content-builder"). A pure, DOM/D3-free module: takes a node datum and returns an HTML
// string, with zero knowledge of tooltips, panels, cursors, or the DOM. `app.js` is the only
// caller — both the hover tooltip (`showTooltip`) and the right-panel node-info view call this
// SAME function, never a copy-pasted second HTML builder.
//
// `epicCount` is passed in rather than this module reaching into `app.js`'s `links` array itself
// (that closure only exists inside `renderGraph`) — the caller computes it once via its own
// `epicCountForProject` and passes the number through.

import { isProjectNode } from "./project.js";
import { jiraStatusLabel } from "./jira-status.js";
import { statusLabel } from "./colors.js";

export function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/**
 * HTML for a node's info: a project node (FACTORY-911) gets its own project/epics/link `<dl>`
 * (using the supplied `epicCount`), every other node gets the regular label/provider/id/type/
 * jira-status/status/discovery/link `<dl>` — identical fields and order to the pre-FACTORY-957
 * hover tooltip, since this is a straight extraction of its content, not a redesign.
 */
export function nodeInfoHtml(d, { epicCount = 0 } = {}) {
  if (isProjectNode(d)) {
    return `<dl>
      <dt>project</dt><dd>${escapeHtml(d.label)}</dd>
      <dt>epics</dt><dd>${epicCount}</dd>
      <dt>link</dt><dd><a href="${d.url}" target="_blank" rel="noopener">${escapeHtml(d.url)}</a></dd>
    </dl>`;
  }
  return `<dl>
      <dt>label</dt><dd>${escapeHtml(d.label)}</dd>
      <dt>provider</dt><dd>${escapeHtml(d.provider)}</dd>
      <dt>id</dt><dd>${escapeHtml(d.id)}</dd>
      <dt>type</dt><dd>${escapeHtml(d.resourceType ?? "unknown")}</dd>
      <dt>jira status</dt><dd>${escapeHtml(jiraStatusLabel(d))}</dd>
      <dt>status</dt><dd>${escapeHtml(statusLabel(d))}</dd>
      <dt>discovery</dt><dd>${d.discovery === "query" ? "query hit" : "link-discovered"}</dd>
      <dt>link</dt><dd><a href="${d.url}" target="_blank" rel="noopener">${escapeHtml(d.url)}</a></dd>
    </dl>`;
}
