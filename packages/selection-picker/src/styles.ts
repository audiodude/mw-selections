import { css } from "lit";

/**
 * Delivered as a constructable stylesheet (no injected <style>, no inline
 * style attributes) so a host with a strict CSP needs no style-src
 * 'unsafe-inline'. Hosts theme via the exposed part names.
 */
export const pickerStyles = css`
  :host {
    --sp-gap: 0.75rem;
    /* Every mode's form fills this height so switching tabs never resizes the dialog. */
    --sp-form-height: 18rem;
    font: inherit;
  }

  dialog {
    width: min(40rem, 92vw);
    border: 1px solid #a2a9b1;
    border-radius: 4px;
    padding: 1rem;
    color: #202122;
    background: #fff;
  }

  dialog::backdrop {
    background: rgb(0 0 0 / 0.4);
  }

  h2 {
    margin: 0 0 var(--sp-gap);
    font-size: 1.15rem;
  }

  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-bottom: var(--sp-gap);
  }

  nav button[aria-current="true"] {
    font-weight: 600;
    border-bottom: 2px solid #3366cc;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--sp-gap);
    height: var(--sp-form-height);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  label:has(textarea) {
    flex: 1;
    min-height: 0;
  }

  input,
  textarea {
    font: inherit;
    padding: 0.35rem;
    border: 1px solid #a2a9b1;
    border-radius: 2px;
  }

  textarea {
    flex: 1;
    min-height: 0;
    resize: none;
  }

  sp-wikiproject-input {
    display: block;
    position: relative;
    min-width: 0;
  }

  input[part="wikiproject"]:focus {
    outline: 2px solid #3e50cc;
    outline-offset: 2px;
  }

  div[part="wikiproject-popup"] {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 1;
    max-height: min(15rem, 35vh);
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid #dadde3;
    border-radius: 3px;
    background: #fff;
    box-shadow: 0 2px 8px rgb(0 0 0 / 0.15);
  }

  div[part="wikiproject-popup"] ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  div[part="wikiproject-popup"] li {
    padding: 0.5rem 0.65rem;
    border-bottom: 1px solid #eaecf0;
    cursor: pointer;
    overflow-wrap: anywhere;
  }

  div[part="wikiproject-popup"] li:last-child {
    border-bottom: 0;
  }

  div[part="wikiproject-popup"] li:hover,
  div[part="wikiproject-popup"] li[aria-selected="true"] {
    background: #eef0ff;
  }

  div[part="wikiproject-popup"] p {
    margin: 0;
    padding: 0.65rem;
    color: #54595d;
  }

  div[part="status"] {
    /* Reserve one line so an error or summary appearing does not shift the footer. */
    min-height: 1.5rem;
    margin-top: var(--sp-gap);
  }

  p[part="error"] {
    margin: 0;
    color: #b32424;
  }

  p[part="summary"] {
    margin: 0;
    color: #14866d;
  }

  p[part="filename"] {
    margin: 0;
    color: #54595d;
  }

  footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  button {
    font: inherit;
    padding: 0.35rem 0.75rem;
    border: 1px solid #a2a9b1;
    border-radius: 2px;
    background: #f8f9fa;
    cursor: pointer;
  }

  button:disabled {
    color: #72777d;
    cursor: default;
  }
`;
