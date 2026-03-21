import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Mail, MapPin, Calendar, Heart } from 'lucide-react';

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main id="main-content" className="container-blog py-12">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
              About Nexus
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Exploring the intersection of fashion, technology, business, and lifestyle
            </p>
          </div>

          {/* Hero Section */}
          <div className="mb-16">
            <div className="aspect-video rounded-lg bg-muted mb-8 flex items-center justify-center">
              <div className="text-center">
                <div className="w-24 h-24 bg-primary rounded-full mx-auto mb-4 flex items-center justify-center">
                  <Heart className="h-12 w-12 text-primary-foreground" />
                </div>
                <p className="text-muted-foreground">Author Photo Placeholder</p>
              </div>
            </div>
          </div>

          {/* About Content */}
          <div className="grid md:grid-cols-2 gap-12 mb-16">
            <div className="space-y-6">
              <h2 className="text-3xl font-bold text-foreground">Our Story</h2>
              <div className="space-y-4 text-muted-foreground">
                <p>
                  Welcome to Nexus, where diverse worlds converge. Founded with a passion for exploring 
                  the connections between fashion, technology, business, and lifestyle, we believe that 
                  the most interesting insights happen at the intersections.
                </p>
                <p>
                  Our mission is to provide thoughtful, well-researched content that helps you navigate 
                  the complex landscape of modern life. Whether you're interested in the latest fashion 
                  trends, emerging technologies, business strategies, or lifestyle optimization, we're 
                  here to guide your journey.
                </p>
                <p>
                  We curate content that matters, diving deep into topics that shape our world while 
                  maintaining an accessible, engaging approach that speaks to curious minds everywhere.
                </p>
              </div>
            </div>

            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-semibold text-foreground mb-4">What We Cover</h3>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <span className="text-muted-foreground">Fashion trends and style insights</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <span className="text-muted-foreground">Technology and innovation</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <span className="text-muted-foreground">Business strategy and entrepreneurship</span>
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-primary rounded-full"></div>
                    <span className="text-muted-foreground">Lifestyle and personal development</span>
                  </li>
                </ul>
              </div>

              <div className="bg-muted p-6 rounded-lg">
                <h3 className="text-xl font-semibold text-foreground mb-4">Quick Stats</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-primary" />
                    <span className="text-muted-foreground">Publishing since 2023</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-primary" />
                    <span className="text-muted-foreground">Based globally, thinking locally</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-primary" />
                    <span className="text-muted-foreground">Weekly newsletter subscribers</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="text-center bg-muted p-8 rounded-lg">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              Ready to Join Our Community?
            </h2>
            <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
              Stay updated with our latest insights and discoveries. Connect with like-minded individuals 
              who share your curiosity about the world around us.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button asChild size="lg">
                <Link to="/contact">Get in Touch</Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link to="/posts">Browse Articles</Link>
              </Button>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default About;