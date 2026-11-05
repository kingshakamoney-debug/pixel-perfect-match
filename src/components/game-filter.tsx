import { useQuery } from "@tanstack/react-query";
import { fetchGames } from "@/lib/data";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function GameFilter({ value, onChange, gameIds }: { value: string; onChange: (v: string) => void; gameIds?: string[] }) {
  const all = useQuery({ queryKey: ["games"], queryFn: fetchGames });
  const games = { data: gameIds ? (all.data ?? []).filter((g) => gameIds.includes(g.id)) : all.data };
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
