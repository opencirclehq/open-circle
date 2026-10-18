import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { TextureButton } from "@/components/ui/texture-button";
import { PortfolioView } from "@/components/portfolio/portfolio-view";
import { ContentSkeleton } from "@/components/site-skeleton";
import { portfolioApi } from "@/lib/portfolio-api";
import { progressionApi } from "@/lib/progression-api";
import { ApiError } from "@/lib/api";
import "@/components/portfolio/studio.css";

export default function PublicPortfolio({ slug: tenantSlug }: { slug?: string }) {
  const { slug } = useParams();
  const address = (tenantSlug ?? slug ?? "").toLowerCase();
  const query = useQuery({ queryKey: ["public-portfolio", address], queryFn: ({ signal }) => portfolioApi.public(address, signal), retry: false, staleTime: 0, refetchInterval: 60_000 });
  const progression = useQuery({ queryKey: ["progression", query.data?.githubLogin?.toLowerCase() ?? ""], queryFn: ({ signal }) => progressionApi.member(query.data!.githubLogin, signal), enabled: !!query.data?.githubLogin, retry: false, staleTime: 60_000, refetchOnWindowFocus: false });
  useEffect(() => {
    if (!query.data && !query.isError) return;
    const previous = document.title;
    document.title = query.isError ? "Portfolio unavailable · OpenCircle" : `${query.data!.displayName}${query.data!.headline ? ` · ${query.data!.headline}` : ""}`;
    return () => { document.title = previous; };
  }, [query.data, query.isError]);
  if (query.isPending) return <main className="mx-auto max-w-5xl px-6 py-16"><ContentSkeleton label="Loading portfolio…" detail /></main>;
  if (!query.data || query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return <main className="studio-error-panel"><h1>{missing ? "Portfolio unavailable" : "Couldn't load this portfolio"}</h1><p>{missing ? "This portfolio hasn't been published, or its owner has taken it offline." : query.error?.message ?? "Please try again."}</p>{!missing && <TextureButton type="button" className="mt-6 w-auto" onClick={() => void query.refetch()}>Try again</TextureButton>}<TextureButton asChild variant="secondary" className="mt-6 w-auto"><a href="https://opencircle.cc">Explore OpenCircle</a></TextureButton></main>;
  }
  return <PortfolioView portfolio={query.data} progression={progression.data} />;
}
