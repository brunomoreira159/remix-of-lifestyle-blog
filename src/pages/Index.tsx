import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { DefaultFeaturedArticle } from '@/components/FeaturedArticle';
import EditorsPick from '@/components/EditorsPick';
import TrendingBlock from '@/components/TrendingBlock';
import MasonryBlock from '@/components/MasonryBlock';
import BlogGrid from '@/components/BlogGrid';

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content">
        <DefaultFeaturedArticle />
        <section aria-labelledby="editors-pick-heading">
          <EditorsPick />
        </section>
        <section aria-labelledby="trending-heading">
          <TrendingBlock />
        </section>
        <section aria-labelledby="masonry-heading">
          <MasonryBlock />
        </section>
        <section aria-labelledby="all-posts-heading">
          <BlogGrid />
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default Index;
