"use client";

import { useState, type ReactNode } from "react";

export function Section({
  title,
  collapsible = false,
  defaultOpen = true,
  children,
}: {
  title: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(collapsible ? defaultOpen : true);
  return (
    <div
      style={{
        background: "#FDFBF7",
        border: "1px solid #E8E0D0",
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <div
        onClick={() => collapsible && setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: collapsible ? "pointer" : "default",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 700,
            color: "#3D5A3E",
            letterSpacing: "0.5px",
            textTransform: "uppercase",
            fontFamily: "'Cormorant Garamond', Georgia, serif",
          }}
        >
          {title}
        </h3>
        {collapsible && (
          <span
            style={{
              fontSize: 16,
              color: "#8B7355",
              transition: "transform 0.2s",
              transform: open ? "rotate(180deg)" : "none",
              display: "inline-block",
            }}
          >
            ▾
          </span>
        )}
      </div>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}
