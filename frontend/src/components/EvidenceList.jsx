import { Icon } from "./ui.jsx";

function EvidenceRow({ url, imageUrl, index }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="glass-panel p-4 rounded-lg flex items-center justify-between group hover:bg-surface-variant/30 transition-all"
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="w-10 h-10 shrink-0 bg-surface-container rounded flex items-center justify-center text-on-surface-variant">
          <Icon name={imageUrl ? "image" : "link"} className="text-[18px]" />
        </div>
        <div className="min-w-0">
          <p className="text-body-md font-medium truncate">Source {index + 1}</p>
          <p className="text-label-sm font-mono text-secondary truncate">{url}</p>
        </div>
      </div>
      <Icon name="open_in_new" className="text-on-surface-variant text-[16px] shrink-0" />
    </a>
  );
}

export default function EvidenceList({ title, urls = [], imageUrl }) {
  if (urls.length === 0 && !imageUrl) return null;
  return (
    <div>
      <h3 className="text-label-sm font-mono text-on-surface-variant uppercase tracking-widest mb-4">{title}</h3>
      <div className="space-y-3">
        {urls.map((u, i) => (
          <EvidenceRow key={u} url={u} index={i} />
        ))}
        {imageUrl && (
          <a href={imageUrl} target="_blank" rel="noreferrer" className="glass-panel p-4 rounded-lg flex items-center gap-4 hover:bg-surface-variant/30 transition-all">
            <div className="w-10 h-10 shrink-0 bg-primary/10 rounded flex items-center justify-center text-primary">
              <Icon name="photo_camera" className="text-[18px]" />
            </div>
            <div className="min-w-0">
              <p className="text-body-md font-medium">Certificate / screenshot image</p>
              <p className="text-label-sm font-mono text-secondary truncate">{imageUrl}</p>
            </div>
          </a>
        )}
      </div>
    </div>
  );
}
