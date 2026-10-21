import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { MotionConfig } from "motion/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import { TrafficTracker } from "./components/traffic-tracker";
import { portfolioSlugFromHostname } from "@shared/portfolio";
import { ThemeProvider } from "./components/theme-provider";
import { ContentSkeleton } from "./components/site-skeleton";

const Events = lazy(() => import("./pages/Events"));
const Admin = lazy(() => import("./pages/Admin"));
const Portfolio = lazy(() => import("./pages/Portfolio"));
const Community = lazy(() => import("./pages/Community"));
const Participation = lazy(() => import("./pages/Participation"));
const PublicPortfolio = lazy(() => import("./pages/PublicPortfolio"));
const Blog = lazy(() => import("./pages/Blog"));
const portfolioSlug = portfolioSlugFromHostname(window.location.hostname);

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <Sonner />
          <BrowserRouter>
            {!portfolioSlug && <TrafficTracker />}
            <Suspense fallback={<ContentSkeleton label="Loading page…" className="mx-auto max-w-3xl px-4 py-20" detail />}>
            {portfolioSlug ? <PublicPortfolio slug={portfolioSlug} /> : <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/repositories" element={<Index />} />
              <Route path="/tools" element={<Index />} />
              <Route path="/community" element={<Community />} />
              <Route path="/community/:id" element={<Community />} />
              <Route path="/community/help/:helpId" element={<Community />} />
              <Route path="/participation" element={<Participation />} />
              <Route path="/how-it-works" element={<Index />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/mine" element={<Blog view="mine" />} />
              <Route path="/blog/write" element={<Blog view="write" />} />
              <Route path="/blog/write/:id" element={<Blog view="write" />} />
              <Route path="/blog/:slug" element={<Blog view="post" />} />
              <Route path="/events" element={<Events />} />
              <Route path="/events/:slug" element={<Events />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/p/:slug" element={<PublicPortfolio />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>}
            </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </MotionConfig>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
