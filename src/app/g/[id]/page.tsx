import type { Metadata } from "next";
import { GameClient } from "@/components/game-client";

export const metadata: Metadata = {
  title: "Гра",
};

export default async function GamePage(props: PageProps<"/g/[id]">) {
  const { id } = await props.params;
  return <GameClient id={id.toUpperCase()} />;
}
