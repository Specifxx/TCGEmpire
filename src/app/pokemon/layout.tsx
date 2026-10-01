import { notFound } from "next/navigation";
import { pokemonEnabled } from "@/lib/pokemon/gate";
import { PokemonQuickViewProvider } from "@/components/pokemon/PokemonQuickView";
import { PokemonSubnav } from "@/components/pokemon/PokemonSubnav";
import { getPokemonPosts } from "@/lib/pokemon/blog/index";

// The Pokémon section's gate and frame (docs/pokemon/README.md).
//
// OFF → every /pokemon URL is the site's 404, rendered here before any page
// reads anything: NEXT_PUBLIC_POKEMON_SECTION="1" and POKEMON_DATABASE_URL
// must both be set (lib/pokemon/gate.ts pokemonEnabled). No middleware (a test
// forbids it) and no loading.tsx anywhere under this folder: adsense-guard
// fails a loading.tsx above a page that calls notFound().
//
// ON → the section's own sub-navigation and its quick view, which mounts here
// and nowhere else, so nothing Pokémon loads on a Riftbound page. The Blog tab
// shows once a post is published (the registry is pure, no read).
export default function PokemonLayout({ children }: { children: React.ReactNode }) {
  if (!pokemonEnabled()) notFound();
  return (
    <PokemonQuickViewProvider>
      <PokemonSubnav showBlog={getPokemonPosts().length > 0} />
      {children}
    </PokemonQuickViewProvider>
  );
}
