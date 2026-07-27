export function formatTs(unixSeconds) {
  if (!unixSeconds) return "—";
  const d = new Date(Number(unixSeconds) * 1000);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatCountdown(targetUnixSeconds) {
  const diff = Number(targetUnixSeconds) * 1000 - Date.now();
  if (diff <= 0) return null;
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}D ${hours}H ${minutes}M`;
  return `${hours}H ${minutes}M ${seconds}S`;
}
