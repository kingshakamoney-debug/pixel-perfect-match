import { useQuery } from "@tanstack/react-query";
import { fetchGames } from "@/lib/data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function GameFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const games = useQuery({ queryKey: ["games"], queryFn: fetchGames });
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-64"><SelectValue placeholder="All games" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All games</SelectItem>
        {(games.data ?? []).map((g) => (
          <SelectItem key={g.id} value={g.id}>{g.provider?.name} · {g.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
