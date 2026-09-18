import {
  fetchJsonCapped,
  type FetchLike,
  type Item,
  type Selection,
} from "@audiodude/selection-core";
import { pickerErr, pickerOk, type PickerResult } from "./result.js";

const PROJECTS_URL = "https://api.wp1.openzim.org/v1/projects/";
const NAMESPACES_URL =
  "https://en.wikipedia.org/w/api.php?action=query&meta=siteinfo&siprop=namespaces%7Cnamespacealiases&format=json&formatversion=2&origin=*";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function loadWikiProjects(fetch: FetchLike): Promise<PickerResult<string[]>> {
  const result = await fetchJsonCapped(fetch, PROJECTS_URL);
  if (!result.ok) return result;
  if (!Array.isArray(result.value)) return pickerErr("UPSTREAM_SHAPE", "Expected a project list.");
  const names = new Set<string>();
  for (const project of result.value) {
    if (!record(project) || typeof project.name !== "string" || project.name.trim() === "") {
      return pickerErr("UPSTREAM_SHAPE", "Expected a WikiProject name.");
    }
    names.add(project.name);
  }
  return pickerOk([...names].sort((a, b) => a.localeCompare(b)));
}

/** WP1 supplies prefixed titles; Selections store the namespace separately. */
async function loadNamespaces(fetch: FetchLike): Promise<PickerResult<Map<string, number>>> {
  const result = await fetchJsonCapped(fetch, NAMESPACES_URL);
  if (!result.ok) return result;
  const data = result.value;
  if (!record(data) || !record(data.query) || !record(data.query.namespaces) ||
      !Array.isArray(data.query.namespacealiases)) {
    return pickerErr("UPSTREAM_SHAPE", "Expected English Wikipedia namespaces.");
  }
  const namespaces = new Map<string, number>();
  for (const entry of [...Object.values(data.query.namespaces), ...data.query.namespacealiases]) {
    if (!record(entry) || !Number.isSafeInteger(entry.id)) {
      return pickerErr("UPSTREAM_SHAPE", "Invalid namespace entry.");
    }
    const name = entry.name ?? entry.alias;
    if (typeof name !== "string") return pickerErr("UPSTREAM_SHAPE", "Missing namespace name.");
    namespaces.set(name.replace(/ /g, "_").toLowerCase(), entry.id as number);
    if (typeof entry.canonical === "string") {
      namespaces.set(entry.canonical.replace(/ /g, "_").toLowerCase(), entry.id as number);
    }
  }
  return pickerOk(namespaces);
}

/** Read every JSON page; a failed later page must never become a partial selection. */
export async function fetchWikiProjectSelection(
  project: string,
  fetch: FetchLike,
): Promise<PickerResult<Selection>> {
  const url = `${PROJECTS_URL}${encodeURIComponent(project.replace(/ /g, "_"))}/articles`;
  const pages: Item[] = [];
  const seen = new Set<string>();
  let namespaces: Map<string, number> | undefined;
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page += 1) {
    const result = await fetchJsonCapped(fetch, `${url}?numRows=500&page=${page}`);
    if (!result.ok) return result;
    const data = result.value;
    if (!record(data) || !Array.isArray(data.articles) || !record(data.pagination) ||
        !Number.isSafeInteger(data.pagination.total_pages) ||
        (data.pagination.total_pages as number) < 0 ||
        !Number.isSafeInteger(data.pagination.total) || (data.pagination.total as number) < 0 ||
        Number(data.pagination.page) !== page) {
      return pickerErr("UPSTREAM_SHAPE", "Invalid WikiProject article pagination.");
    }
    const count = data.pagination.total_pages as number;
    if ((page > 1 && count !== totalPages) ||
        (data.pagination.total !== 0 && (count < page || data.articles.length === 0))) {
      return pickerErr("UPSTREAM_SHAPE", "WikiProject pagination changed or is incomplete; reload.");
    }
    totalPages = count;
    for (const article of data.articles) {
      if (!record(article) || typeof article.article !== "string" ||
          article.article.trim() === "" || /[\t\r\n]/.test(article.article)) {
        return pickerErr("UPSTREAM_SHAPE", "Expected a WikiProject article title.");
      }
      let title = article.article.replace(/ /g, "_");
      let ns = 0;
      const colon = title.indexOf(":");
      if (colon !== -1) {
        if (namespaces === undefined) {
          const loaded = await loadNamespaces(fetch);
          if (!loaded.ok) return loaded;
          namespaces = loaded.value;
        }
        ns = namespaces.get(title.slice(0, colon).toLowerCase()) ?? 0;
        if (ns !== 0) title = title.slice(colon + 1);
      }
      const key = `${ns}\t${title}`;
      if (!seen.has(key)) {
        seen.add(key);
        pages.push(ns === 0 ? title : [title, null, ns]);
      }
    }
  }
  return pickerOk({
    dbname: "enwiki",
    pages,
    source: { type: "wikiproject", project, url, dynamic: true },
  });
}
