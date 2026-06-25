"use client";

export default function ActionMenu({ open, labelledBy, children }) {
  if (!open) return null;

  return (
    <div className="action-menu" role="menu" aria-labelledby={labelledBy}>
      {children}
    </div>
  );
}
