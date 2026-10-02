export function Avatar({ emoji, color, size = 88 }: { emoji: string; color: string; size?: number }) {
  return (
    <span
      className="avatar"
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: size * 0.46, ['--tone' as string]: color }}
    >
      {emoji}
    </span>
  );
}
