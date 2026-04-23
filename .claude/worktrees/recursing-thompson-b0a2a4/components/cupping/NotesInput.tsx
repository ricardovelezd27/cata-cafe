"use client";

export function NotesInput({
  value,
  onChange,
  placeholder = "Notas libres...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        minHeight: 40,
        border: "1px solid #D4C5A9",
        borderRadius: 8,
        padding: 8,
        fontSize: 13,
        fontFamily: "inherit",
        background: "#FEFCF8",
        color: "#5C4A32",
        resize: "vertical",
        boxSizing: "border-box",
      }}
    />
  );
}
