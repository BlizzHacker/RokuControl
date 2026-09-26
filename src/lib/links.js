/* global __APP_VERSION__ */
import { api } from './api';

export const APP_VERSION = __APP_VERSION__;
export const WEBSITE = 'https://moveweight.com';
export const REPO = 'https://github.com/BlizzHacker/RokuControl';
export const STORE_REVIEW = 'ms-windows-store://review/?ProductId=9MTNNGZKJ1WK';
export const isWindows = /Windows/i.test(navigator.userAgent);

export function openLink(url) {
  return api.openLink(url).catch(() => {
    // Running in a plain browser (npm run dev) — fall back to a new tab.
    window.open(url, '_blank', 'noopener');
  });
}

export function osName() {
  const ua = navigator.userAgent;
  if (/Windows NT 10/.test(ua)) return 'Windows 10/11';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown';
}

const redactIps = (s) => String(s ?? '').replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '<lan-ip>');

/** What a bug report needs, minus anything personal: no IPs, serials, MACs or names. */
export function diagnostics(device, lastError) {
  const lines = [`Roku Control ${APP_VERSION} on ${osName()}`];
  if (device) {
    const model = [device.vendor, device.model, device.modelNumber].filter(Boolean).join(' ');
    lines.push(`Roku: ${model || 'model unknown'}${device.isTv ? ' (TV)' : ''}`);
    lines.push(`Roku OS: ${device.softwareVersion || 'unknown'}`);
    lines.push(`Control by mobile apps: ${device.ecpMode || 'not reported'}`);
    lines.push(`Power mode: ${device.powerMode || 'unknown'} · Network: ${device.networkType || 'unknown'}`);
  } else {
    lines.push('Roku: none found');
  }
  if (lastError) lines.push(`Last error (${lastError.kind}): ${redactIps(lastError.message)}`);
  return lines.join('\n');
}

const query = (params) =>
  Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');

/** A GitHub "new issue" link that opens the matching form with the details filled in. */
export function issueUrl(type, { device, lastError } = {}) {
  if (type === 'bug') {
    return `${REPO}/issues/new?${query({
      template: 'bug_report.yml',
      title: '[Bug]: ',
      version: APP_VERSION,
      environment: diagnostics(device, lastError),
    })}`;
  }
  return `${REPO}/issues/new?${query({ template: 'feature_request.yml', title: '[Idea]: ', version: APP_VERSION })}`;
}

/** Windows users rate in the Store; everyone else can star the repo. */
export const rateUrl = () => (isWindows ? STORE_REVIEW : REPO);
