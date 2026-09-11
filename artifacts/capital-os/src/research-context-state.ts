export type ResearchContextUiState = "loading" | "error" | "empty" | "available";

export function researchContextUiState(input: {
  isLoading: boolean;
  isError: boolean;
  data?: { researchContext?: { status?: string } } | null;
}): ResearchContextUiState {
  if (input.isLoading) return "loading";
  if (input.isError || !input.data) return "error";
  return input.data.researchContext?.status === "available" ? "available" : "empty";
}