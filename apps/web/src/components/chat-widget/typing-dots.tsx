export default function TypingDots() {
  return (
    <div className="flex w-fit items-center gap-1 rounded-r3 bg-n-100 px-4 py-3">
      <span className="h-2 w-2 animate-bounce rounded-full bg-n-400 [animation-delay:-0.3s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-n-400 [animation-delay:-0.15s]" />
      <span className="h-2 w-2 animate-bounce rounded-full bg-n-400" />
    </div>
  );
}
