export interface GameDefinition {
  gameType: string;
  displayName: string;
  minPlayers: number;
  maxPlayers: number;
  /** Markdown for the how-to-play overlay. */
  howToPlay: string;
}
