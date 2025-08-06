const fs = require('fs').promises;
const path = require('path');
const yaml = require('js-yaml');

class AgentsGallery {
  constructor() {
    this.galleryPath = path.join(__dirname, '..', '..', 'agents-gallery');
    console.log('AgentsGallery constructor - Gallery path:', this.galleryPath);
    this.agentsData = null;
    this.agentCategories = {
      'backend-architect': 'Development & Architecture',
      'frontend-developer': 'Development & Architecture',
      'ui-ux-designer': 'Development & Architecture',
      'mobile-developer': 'Development & Architecture',
      'graphql-architect': 'Development & Architecture',
      'architect-review': 'Development & Architecture',
      
      'python-pro': 'Language Specialists',
      'golang-pro': 'Language Specialists',
      'rust-pro': 'Language Specialists',
      'c-pro': 'Language Specialists',
      'cpp-pro': 'Language Specialists',
      'javascript-pro': 'Language Specialists',
      'typescript-pro': 'Language Specialists',
      'php-pro': 'Language Specialists',
      'java-pro': 'Language Specialists',
      'ios-developer': 'Language Specialists',
      'sql-pro': 'Language Specialists',
      
      'devops-troubleshooter': 'Infrastructure & Operations',
      'deployment-engineer': 'Infrastructure & Operations',
      'cloud-architect': 'Infrastructure & Operations',
      'database-optimizer': 'Infrastructure & Operations',
      'database-admin': 'Infrastructure & Operations',
      'terraform-specialist': 'Infrastructure & Operations',
      'incident-responder': 'Infrastructure & Operations',
      'network-engineer': 'Infrastructure & Operations',
      'dx-optimizer': 'Infrastructure & Operations',
      
      'code-reviewer': 'Quality & Security',
      'security-auditor': 'Quality & Security',
      'test-automator': 'Quality & Security',
      'performance-engineer': 'Quality & Security',
      'debugger': 'Quality & Security',
      'error-detective': 'Quality & Security',
      'search-specialist': 'Quality & Security',
      
      'data-scientist': 'Data & AI',
      'data-engineer': 'Data & AI',
      'ai-engineer': 'Data & AI',
      'ml-engineer': 'Data & AI',
      'mlops-engineer': 'Data & AI',
      'prompt-engineer': 'Data & AI',
      
      'api-documenter': 'Specialized Domains',
      'payment-integration': 'Specialized Domains',
      'quant-analyst': 'Specialized Domains',
      'risk-manager': 'Specialized Domains',
      'legacy-modernizer': 'Specialized Domains',
      'context-manager': 'Specialized Domains',
      
      'business-analyst': 'Business & Marketing',
      'content-marketer': 'Business & Marketing',
      'sales-automator': 'Business & Marketing',
      'customer-support': 'Business & Marketing',
      'legal-advisor': 'Business & Marketing'
    };
  }

  async ensureGalleryDirectory() {
    try {
      await fs.access(this.galleryPath);
    } catch (error) {
      await fs.mkdir(this.galleryPath, { recursive: true });
    }
  }

  parseMarkdownAgent(content) {
    console.log('parseMarkdownAgent called with content length:', content.length);
    
    // Remove the source comment line and any empty lines at the start
    const lines = content.split('\n');
    let startIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() && !lines[i].startsWith('# Source:')) {
        startIndex = i;
        break;
      }
    }
    
    const cleanContent = lines.slice(startIndex).join('\n');
    console.log('Clean content starts with:', cleanContent.substring(0, 50));
    
    // Extract YAML frontmatter
    const yamlMatch = cleanContent.match(/^---\n([\s\S]*?)\n---/);
    if (!yamlMatch) {
      console.log('No YAML frontmatter found');
      return null;
    }

    try {
      const frontmatter = yaml.load(yamlMatch[1]);
      const bodyContent = cleanContent.slice(yamlMatch[0].length).trim();
      
      console.log('Parsed frontmatter:', frontmatter);

      return {
        name: frontmatter.name,
        description: frontmatter.description || '',
        model: frontmatter.model || 'default',
        system_prompt: bodyContent,
        tools: frontmatter.tools || []
      };
    } catch (error) {
      console.error('Error parsing markdown agent:', error);
      return null;
    }
  }

  async loadAgentsFromFiles() {
    console.log('loadAgentsFromFiles called');
    console.log('Gallery path:', this.galleryPath);
    
    await this.ensureGalleryDirectory();
    
    try {
      const files = await fs.readdir(this.galleryPath);
      console.log('Files in gallery directory:', files);
      
      const mdFiles = files.filter(file => file.endsWith('.md'));
      console.log('Markdown files found:', mdFiles.length);
      
      const agents = [];
      
      for (const file of mdFiles) {
        try {
          const filePath = path.join(this.galleryPath, file);
          console.log(`Loading agent from: ${filePath}`);
          
          const content = await fs.readFile(filePath, 'utf8');
          const agent = this.parseMarkdownAgent(content);
          
          if (agent) {
            const agentName = path.basename(file, '.md');
            agent.name = agent.name || agentName;
            agent.category = this.agentCategories[agentName] || 'Uncategorized';
            agent.metadata = {
              source: 'wshobson/agents',
              license: 'MIT'
            };
            agents.push(agent);
            console.log(`Successfully loaded agent: ${agent.name}`);
          } else {
            console.log(`Failed to parse agent from ${file}`);
          }
        } catch (error) {
          console.error(`Error loading agent ${file}:`, error);
        }
      }
      
      console.log(`Total agents loaded: ${agents.length}`);
      return agents;
    } catch (error) {
      console.error('Error loading agents from files:', error);
      console.error('Stack trace:', error.stack);
      return [];
    }
  }

  async saveGalleryData() {
    const dataPath = path.join(this.galleryPath, 'agents-data.json');
    await fs.writeFile(dataPath, JSON.stringify(this.agentsData, null, 2), 'utf8');
  }

  getDefaultAgentsData() {
    // Based on wshobson/agents repository
    return {
      source: "wshobson/agents",
      license: "MIT",
      lastUpdated: new Date().toISOString(),
      categories: {
        "Development & Architecture": [
          {
            name: "backend-architect",
            description: "Designs scalable backend systems and APIs",
            system_prompt: "You are an expert backend architect specializing in designing scalable, maintainable backend systems. Focus on API design, database architecture, and system scalability.",
            tools: ["read_file", "search_code", "analyze_dependencies"],
            model: "sonnet"
          },
          {
            name: "frontend-developer",
            description: "Builds modern, responsive user interfaces",
            system_prompt: "You are a frontend development expert specializing in modern web frameworks and responsive design. Focus on user experience, performance, and accessibility.",
            tools: ["read_file", "search_code", "write_file"],
            model: "sonnet"
          },
          {
            name: "ui-ux-designer",
            description: "Creates intuitive user interfaces and experiences",
            system_prompt: "You are a UI/UX design expert who creates intuitive, beautiful interfaces. Focus on user research, design systems, and accessibility.",
            tools: ["read_file", "write_file"],
            model: "sonnet"
          },
          {
            name: "mobile-developer",
            description: "Develops native and cross-platform mobile applications",
            system_prompt: "You are a mobile development expert for iOS and Android. Focus on native development, cross-platform solutions, and mobile-specific optimizations.",
            tools: ["read_file", "search_code", "write_file"],
            model: "sonnet"
          },
          {
            name: "architect-reviewer",
            description: "Reviews and improves system architecture",
            system_prompt: "You are an architecture review expert who evaluates system designs for scalability, maintainability, and best practices.",
            tools: ["read_file", "search_code", "analyze_dependencies"],
            model: "opus"
          }
        ],
        "Language Specialists": [
          {
            name: "python-pro",
            description: "Python development expert",
            system_prompt: "You are a Python expert specializing in clean, idiomatic Python code. Focus on best practices, performance optimization, and Python ecosystem.",
            tools: ["read_file", "search_code", "write_file", "run_python"],
            model: "sonnet"
          },
          {
            name: "golang-pro",
            description: "Go language specialist",
            system_prompt: "You are a Go language expert focusing on concurrent programming, performance, and idiomatic Go code.",
            tools: ["read_file", "search_code", "write_file"],
            model: "sonnet"
          },
          {
            name: "rust-pro",
            description: "Rust systems programming expert",
            system_prompt: "You are a Rust expert specializing in memory safety, performance, and systems programming.",
            tools: ["read_file", "search_code", "write_file"],
            model: "sonnet"
          },
          {
            name: "javascript-pro",
            description: "JavaScript and Node.js expert",
            system_prompt: "You are a JavaScript expert covering both frontend and Node.js development. Focus on modern ES6+, async patterns, and ecosystem best practices.",
            tools: ["read_file", "search_code", "write_file", "run_javascript"],
            model: "sonnet"
          },
          {
            name: "typescript-pro",
            description: "TypeScript type system expert",
            system_prompt: "You are a TypeScript expert specializing in type safety, advanced type patterns, and TypeScript best practices.",
            tools: ["read_file", "search_code", "write_file"],
            model: "sonnet"
          }
        ],
        "Infrastructure & Operations": [
          {
            name: "devops-troubleshooter",
            description: "Diagnoses and fixes DevOps issues",
            system_prompt: "You are a DevOps troubleshooting expert who quickly identifies and resolves infrastructure, deployment, and operational issues.",
            tools: ["read_file", "search_code", "run_command"],
            model: "sonnet"
          },
          {
            name: "cloud-architect",
            description: "Designs cloud-native architectures",
            system_prompt: "You are a cloud architecture expert specializing in AWS, Azure, and GCP. Focus on scalable, cost-effective cloud solutions.",
            tools: ["read_file", "write_file", "analyze_dependencies"],
            model: "sonnet"
          },
          {
            name: "terraform-specialist",
            description: "Infrastructure as Code expert",
            system_prompt: "You are a Terraform and IaC expert who creates maintainable, modular infrastructure configurations.",
            tools: ["read_file", "search_code", "write_file"],
            model: "sonnet"
          },
          {
            name: "database-optimizer",
            description: "Optimizes database performance",
            system_prompt: "You are a database optimization expert who improves query performance, schema design, and database configurations.",
            tools: ["read_file", "analyze_query", "write_file"],
            model: "sonnet"
          },
          {
            name: "network-engineer",
            description: "Network architecture and security expert",
            system_prompt: "You are a network engineering expert specializing in network design, security, and troubleshooting.",
            tools: ["read_file", "analyze_network", "write_file"],
            model: "sonnet"
          }
        ],
        "Quality & Security": [
          {
            name: "code-reviewer",
            description: "Reviews code for quality and best practices",
            system_prompt: "You are a code review expert who ensures code quality, identifies bugs, and suggests improvements. Focus on readability, maintainability, and best practices.",
            tools: ["read_file", "search_code", "analyze_dependencies"],
            model: "opus"
          },
          {
            name: "security-auditor",
            description: "Identifies security vulnerabilities",
            system_prompt: "You are a security audit expert who identifies vulnerabilities, security risks, and provides remediation strategies.",
            tools: ["read_file", "search_code", "analyze_dependencies", "security_scan"],
            model: "opus"
          },
          {
            name: "test-automator",
            description: "Creates comprehensive test suites",
            system_prompt: "You are a test automation expert who creates comprehensive unit, integration, and e2e tests. Focus on test coverage and reliability.",
            tools: ["read_file", "search_code", "write_file", "run_tests"],
            model: "sonnet"
          },
          {
            name: "performance-engineer",
            description: "Optimizes application performance",
            system_prompt: "You are a performance engineering expert who identifies bottlenecks and optimizes application performance.",
            tools: ["read_file", "search_code", "profile_code", "analyze_metrics"],
            model: "sonnet"
          },
          {
            name: "debugger",
            description: "Expert at finding and fixing bugs",
            system_prompt: "You are a debugging expert who quickly identifies root causes of bugs and provides effective fixes.",
            tools: ["read_file", "search_code", "run_debugger", "analyze_logs"],
            model: "sonnet"
          }
        ],
        "Data & AI": [
          {
            name: "data-scientist",
            description: "Data analysis and machine learning expert",
            system_prompt: "You are a data science expert specializing in statistical analysis, machine learning, and data visualization.",
            tools: ["read_file", "run_python", "analyze_data", "create_visualization"],
            model: "opus"
          },
          {
            name: "data-engineer",
            description: "Builds data pipelines and infrastructure",
            system_prompt: "You are a data engineering expert who designs and builds scalable data pipelines and infrastructure.",
            tools: ["read_file", "search_code", "write_file", "run_pipeline"],
            model: "sonnet"
          },
          {
            name: "ai-engineer",
            description: "Implements AI/ML solutions",
            system_prompt: "You are an AI engineering expert who implements and deploys machine learning models in production.",
            tools: ["read_file", "run_python", "train_model", "deploy_model"],
            model: "opus"
          },
          {
            name: "ml-engineer",
            description: "Machine learning systems expert",
            system_prompt: "You are a machine learning engineer specializing in ML systems, model optimization, and deployment.",
            tools: ["read_file", "run_python", "optimize_model", "analyze_metrics"],
            model: "opus"
          },
          {
            name: "prompt-engineer",
            description: "Optimizes LLM prompts and interactions",
            system_prompt: "You are a prompt engineering expert who crafts effective prompts and optimizes LLM interactions.",
            tools: ["read_file", "write_file", "test_prompt"],
            model: "sonnet"
          }
        ],
        "Specialized Domains": [
          {
            name: "api-documenter",
            description: "Creates comprehensive API documentation",
            system_prompt: "You are an API documentation expert who creates clear, comprehensive documentation for APIs and SDKs.",
            tools: ["read_file", "search_code", "write_file", "generate_docs"],
            model: "sonnet"
          },
          {
            name: "payment-integration",
            description: "Payment systems integration expert",
            system_prompt: "You are a payment systems expert specializing in payment gateway integrations, PCI compliance, and financial transactions.",
            tools: ["read_file", "search_code", "write_file"],
            model: "sonnet"
          },
          {
            name: "legacy-modernizer",
            description: "Modernizes legacy codebases",
            system_prompt: "You are a legacy code modernization expert who refactors and updates old codebases to modern standards.",
            tools: ["read_file", "search_code", "write_file", "analyze_dependencies"],
            model: "opus"
          },
          {
            name: "context-manager",
            description: "Manages large codebases and contexts",
            system_prompt: "You are a context management expert who efficiently navigates and understands large codebases.",
            tools: ["read_file", "search_code", "analyze_structure"],
            model: "haiku"
          },
          {
            name: "search-specialist",
            description: "Expert at finding code and information",
            system_prompt: "You are a search specialist who efficiently finds relevant code, documentation, and information across large codebases.",
            tools: ["search_code", "grep", "find_files"],
            model: "haiku"
          }
        ],
        "Business & Marketing": [
          {
            name: "business-analyst",
            description: "Analyzes business requirements and processes",
            system_prompt: "You are a business analysis expert who translates business needs into technical requirements.",
            tools: ["read_file", "write_file", "create_diagram"],
            model: "sonnet"
          },
          {
            name: "content-marketer",
            description: "Creates technical content and documentation",
            system_prompt: "You are a technical content expert who creates engaging documentation, blog posts, and marketing materials.",
            tools: ["read_file", "write_file", "research"],
            model: "sonnet"
          },
          {
            name: "customer-support",
            description: "Handles technical customer inquiries",
            system_prompt: "You are a technical support expert who helps customers resolve issues and provides clear explanations.",
            tools: ["read_file", "search_docs", "analyze_logs"],
            model: "haiku"
          }
        ]
      }
    };
  }

  async getRecommendedAgents() {
    console.log('getRecommendedAgents called');
    // Load agents from markdown files instead of JSON
    const agents = await this.loadAgentsFromFiles();
    console.log('getRecommendedAgents returning', agents.length, 'agents');
    return agents;
  }

  async getAgentsByCategory(category) {
    const agents = await this.loadAgentsFromFiles();
    return agents.filter(agent => agent.category === category);
  }

  async getCategories() {
    // Return unique categories from agentCategories mapping
    return [...new Set(Object.values(this.agentCategories))];
  }

  async updateGalleryFromGitHub() {
    // This method could be implemented to fetch latest agents from GitHub
    // For now, we're using the hardcoded data
    console.log('Gallery update from GitHub not implemented yet');
  }
}

module.exports = new AgentsGallery();