// One-off dev seed: every course besides "javascript-fundamentals" (handled
// by seedJavaScriptFundamentalsCurriculum.ts) had moduleCount/lessonCount/
// projectCount numbers typed in by hand with zero real Module/Lesson/Project
// documents behind them. This gives each of them its own real, topic-specific
// curriculum (matching those existing stats module-for-module and
// lesson-for-lesson) plus a real course PDF, so "Course content" is genuine,
// navigable data for every course, not just the one that was hand-built.
//
// Video: unlike the JS course, these don't get a previewVideoId — reusing
// one real video across unrelated topics (attaching a JS tutorial to an
// "Ethical Hacking" course, say) would be actively misleading, and I'd
// rather leave the banner's play button off entirely (which the UI already
// handles) than fabricate a YouTube id I can't verify actually matches the
// topic. Safe to re-run: clears each course's existing modules/lessons/
// projects first, then recreates them.
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Course } from "../models/Course";
import { Module } from "../models/Module";
import { Lesson } from "../models/Lesson";
import { Project } from "../models/Project";

const PDF_URL = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

interface LessonSpec {
  title: string;
  minutes: number;
}
interface ModuleSpec {
  title: string;
  lessons: LessonSpec[];
  project?: {
    title: string;
    description: string;
    requirements: string[];
    technologies: string[];
    expectedFeatures: string[];
  };
}
interface CourseSpec {
  slug: string;
  tags: string[];
  skillsLearned: string[];
  modules: ModuleSpec[];
}

const COURSES: CourseSpec[] = [
  {
    slug: "react-development",
    tags: ["React"],
    skillsLearned: [
      "Build reusable components with props and state",
      "Manage side effects and data fetching with hooks",
      "Add client-side routing with React Router",
      "Ship a tested, deployed React application",
    ],
    modules: [
      {
        title: "React Basics & JSX",
        lessons: [
          { title: "Introduction to React", minutes: 9 },
          { title: "JSX Syntax", minutes: 8 },
          { title: "Rendering Elements", minutes: 7 },
          { title: "React Developer Tools", minutes: 6 },
        ],
      },
      {
        title: "Components & Props",
        lessons: [
          { title: "Functional Components", minutes: 8 },
          { title: "Props & PropTypes", minutes: 9 },
          { title: "Component Composition", minutes: 10 },
          { title: "Conditional Rendering", minutes: 8 },
        ],
      },
      {
        title: "State & Lifecycle",
        lessons: [
          { title: "The useState Hook", minutes: 10 },
          { title: "Handling Events", minutes: 8 },
          { title: "Lists & Keys", minutes: 9 },
          { title: "Lifting State Up", minutes: 11 },
          { title: "Component Lifecycle", minutes: 9 },
        ],
      },
      {
        title: "Hooks Deep Dive",
        lessons: [
          { title: "The useEffect Hook", minutes: 12 },
          { title: "The useRef Hook", minutes: 9 },
          { title: "useMemo & useCallback", minutes: 13 },
          { title: "Writing Custom Hooks", minutes: 12 },
          { title: "Rules of Hooks", minutes: 7 },
        ],
      },
      {
        title: "Forms & Controlled Inputs",
        lessons: [
          { title: "Controlled Components", minutes: 9 },
          { title: "Form Validation", minutes: 11 },
          { title: "Handling Multiple Inputs", minutes: 8 },
          { title: "Building a Search Filter", minutes: 10 },
        ],
        project: {
          title: "Movie Search App",
          description: "Build a movie search app that fetches results from a public API as the user types, with debounced input and a details view.",
          requirements: ["Debounced search input", "Fetch results from a public API", "Movie details view", "Loading and empty states"],
          technologies: ["React", "JavaScript", "CSS"],
          expectedFeatures: ["Search input with debounce", "Results grid", "Details modal or page", "Graceful loading/error states"],
        },
      },
      {
        title: "React Router",
        lessons: [
          { title: "Setting Up Routing", minutes: 8 },
          { title: "Route Parameters", minutes: 9 },
          { title: "Nested Routes", minutes: 10 },
          { title: "Protected Routes", minutes: 11 },
        ],
      },
      {
        title: "State Management",
        lessons: [
          { title: "The Context API", minutes: 11 },
          { title: "The useReducer Hook", minutes: 12 },
          { title: "Solving Prop Drilling", minutes: 9 },
          { title: "Introduction to Redux", minutes: 14 },
        ],
      },
      {
        title: "Testing & Deployment",
        lessons: [
          { title: "Testing Components", minutes: 13 },
          { title: "Debugging React Apps", minutes: 9 },
          { title: "Performance Optimization", minutes: 12 },
          { title: "Deploying a React App", minutes: 10 },
        ],
        project: {
          title: "Personal Blog Platform",
          description: "A capstone blog platform with routed post pages, a global theme context, and a deployed production build.",
          requirements: ["Routed list/detail post pages", "Global state via Context", "Responsive layout", "Deployed to a live URL"],
          technologies: ["React", "React Router", "CSS"],
          expectedFeatures: ["Post list and detail routes", "Theme toggle via Context", "Responsive design", "Live deployment"],
        },
      },
    ],
  },
  {
    slug: "nodejs-basics",
    tags: ["Node.js"],
    skillsLearned: [
      "Understand Node's module system and npm",
      "Work with core modules like fs, path and events",
      "Build an HTTP server and a basic Express API",
      "Ship a small REST API backed by real endpoints",
    ],
    modules: [
      {
        title: "Introduction to Node.js",
        lessons: [
          { title: "What is Node.js", minutes: 8 },
          { title: "Installing Node & npm", minutes: 6 },
          { title: "Running Your First Script", minutes: 7 },
          { title: "The Node REPL", minutes: 6 },
        ],
      },
      {
        title: "Modules & npm",
        lessons: [
          { title: "CommonJS Modules", minutes: 9 },
          { title: "Creating Your Own Modules", minutes: 9 },
          { title: "Installing Packages with npm", minutes: 8 },
          { title: "package.json Explained", minutes: 7 },
        ],
      },
      {
        title: "Core Modules",
        lessons: [
          { title: "The File System Module", minutes: 10 },
          { title: "The Path Module", minutes: 6 },
          { title: "OS & Process Modules", minutes: 7 },
          { title: "Events & EventEmitter", minutes: 11 },
        ],
      },
      {
        title: "Building a Server",
        lessons: [
          { title: "HTTP Module Basics", minutes: 10 },
          { title: "Handling Requests & Responses", minutes: 11 },
          { title: "Routing Requests", minutes: 9 },
          { title: "Serving Static Files", minutes: 8 },
        ],
      },
      {
        title: "Express.js Basics",
        lessons: [
          { title: "Introduction to Express", minutes: 9 },
          { title: "Express Routing", minutes: 10 },
          { title: "Middleware Basics", minutes: 11 },
          { title: "Handling JSON Requests", minutes: 8 },
        ],
      },
      {
        title: "Working with Data",
        lessons: [
          { title: "Reading & Writing Files", minutes: 9 },
          { title: "Environment Variables", minutes: 6 },
          { title: "Error Handling in Node", minutes: 10 },
          { title: "Debugging Node Apps", minutes: 8 },
        ],
        project: {
          title: "REST API for a Notes App",
          description: "Build a small REST API with Express supporting create, read, update and delete for notes, stored in a JSON file.",
          requirements: ["CRUD endpoints for notes", "Input validation", "Proper HTTP status codes", "Basic error handling middleware"],
          technologies: ["Node.js", "Express"],
          expectedFeatures: ["GET/POST/PUT/DELETE routes", "Persisted storage", "Validation errors return 400", "404 for missing notes"],
        },
      },
    ],
  },
  {
    slug: "build-a-portfolio-website",
    tags: ["Web Development"],
    skillsLearned: [
      "Structure a site with semantic HTML",
      "Build a responsive layout with Flexbox",
      "Add interactivity like dark mode and animations",
      "Deploy a live site with a custom domain",
    ],
    modules: [
      {
        title: "Planning & Structure",
        lessons: [
          { title: "Planning Your Portfolio", minutes: 7 },
          { title: "Setting Up the Project", minutes: 6 },
          { title: "Semantic HTML Structure", minutes: 9 },
        ],
      },
      {
        title: "Styling the Layout",
        lessons: [
          { title: "CSS Layout with Flexbox", minutes: 11 },
          { title: "Building a Responsive Navbar", minutes: 10 },
          { title: "Styling the Hero Section", minutes: 9 },
          { title: "Project Cards Layout", minutes: 10 },
        ],
      },
      {
        title: "Interactivity & Polish",
        lessons: [
          { title: "Adding Smooth Scrolling", minutes: 7 },
          { title: "Dark Mode Toggle", minutes: 10 },
          { title: "Contact Form Basics", minutes: 9 },
          { title: "Animations & Transitions", minutes: 11 },
        ],
      },
      {
        title: "Deployment",
        lessons: [
          { title: "Optimizing for Performance", minutes: 8 },
          { title: "Deploying to Netlify/Vercel", minutes: 9 },
          { title: "Custom Domain Setup", minutes: 7 },
        ],
        project: {
          title: "Personal Portfolio Website",
          description: "A live, responsive personal portfolio site with a hero section, project gallery, dark mode, and a working contact form.",
          requirements: ["Responsive on mobile and desktop", "Dark mode toggle", "Project showcase grid", "Deployed to a live URL"],
          technologies: ["HTML", "CSS", "JavaScript"],
          expectedFeatures: ["Hero section", "Project cards", "Dark mode toggle", "Live deployment link"],
        },
      },
    ],
  },
  {
    slug: "css-grid-mastery",
    tags: ["CSS"],
    skillsLearned: [
      "Build layouts with CSS Grid containers and items",
      "Place and align items precisely with grid areas",
      "Create responsive grids without media-query overload",
      "Combine Grid and Flexbox for real-world layouts",
    ],
    modules: [
      {
        title: "Grid Fundamentals",
        lessons: [
          { title: "Introduction to CSS Grid", minutes: 8 },
          { title: "Grid Container & Items", minutes: 9 },
          { title: "Rows & Columns", minutes: 8 },
          { title: "The fr Unit", minutes: 7 },
        ],
      },
      {
        title: "Placing Items",
        lessons: [
          { title: "grid-column & grid-row", minutes: 10 },
          { title: "Grid Template Areas", minutes: 11 },
          { title: "Aligning Items", minutes: 8 },
          { title: "Justify & Align Content", minutes: 8 },
        ],
      },
      {
        title: "Responsive Grids",
        lessons: [
          { title: "Auto-fill & Auto-fit", minutes: 10 },
          { title: "Grid with Media Queries", minutes: 9 },
          { title: "The minmax() Function", minutes: 8 },
        ],
      },
      {
        title: "Advanced Techniques",
        lessons: [
          { title: "Nested Grids", minutes: 10 },
          { title: "Grid + Flexbox Together", minutes: 11 },
          { title: "Overlapping Elements", minutes: 9 },
          { title: "Implicit vs Explicit Grids", minutes: 9 },
        ],
      },
      {
        title: "Real-World Layouts",
        lessons: [
          { title: "Building a Magazine Layout", minutes: 13 },
          { title: "Building a Dashboard Layout", minutes: 13 },
          { title: "Building a Photo Gallery", minutes: 11 },
        ],
      },
    ],
  },
  {
    slug: "javascript-dom-mastery",
    tags: ["JavaScript"],
    skillsLearned: [
      "Select, traverse and manipulate the DOM tree",
      "Handle events with delegation and bubbling in mind",
      "Validate forms and work with the FormData API",
      "Use storage and observer APIs for real UI features",
    ],
    modules: [
      {
        title: "DOM Basics",
        lessons: [
          { title: "The DOM Tree", minutes: 8 },
          { title: "Selecting Elements", minutes: 9 },
          { title: "Traversing the DOM", minutes: 9 },
          { title: "Creating & Removing Elements", minutes: 10 },
        ],
      },
      {
        title: "Events",
        lessons: [
          { title: "Event Listeners", minutes: 8 },
          { title: "Event Bubbling & Capturing", minutes: 11 },
          { title: "Event Delegation", minutes: 10 },
          { title: "Keyboard & Mouse Events", minutes: 9 },
        ],
      },
      {
        title: "Manipulating Content",
        lessons: [
          { title: "Changing Text & HTML", minutes: 8 },
          { title: "Working with Attributes", minutes: 8 },
          { title: "Styling with JS", minutes: 9 },
          { title: "Class List Manipulation", minutes: 7 },
        ],
      },
      {
        title: "Forms & Validation",
        lessons: [
          { title: "Form Elements in the DOM", minutes: 9 },
          { title: "Validating User Input", minutes: 11 },
          { title: "The FormData API", minutes: 10 },
          { title: "Custom Validation Messages", minutes: 9 },
        ],
      },
      {
        title: "Advanced DOM APIs",
        lessons: [
          { title: "Local Storage & Session Storage", minutes: 10 },
          { title: "Intersection Observer", minutes: 12 },
          { title: "Mutation Observer", minutes: 11 },
          { title: "Building a Custom Modal", minutes: 12 },
        ],
      },
    ],
  },
  {
    slug: "ethical-hacking-fundamentals",
    tags: ["Cybersecurity"],
    skillsLearned: [
      "Understand the ethical hacking process and legal boundaries",
      "Perform reconnaissance and network scanning",
      "Recognize common system and web application attacks",
      "Write a professional penetration test report",
    ],
    modules: [
      {
        title: "Introduction to Ethical Hacking",
        lessons: [
          { title: "What is Ethical Hacking", minutes: 8 },
          { title: "Types of Hackers", minutes: 7 },
          { title: "Legal & Ethical Considerations", minutes: 9 },
          { title: "Setting Up a Lab Environment", minutes: 10 },
        ],
      },
      {
        title: "Reconnaissance",
        lessons: [
          { title: "Passive vs Active Recon", minutes: 8 },
          { title: "Footprinting Techniques", minutes: 10 },
          { title: "Using Whois & DNS Lookups", minutes: 9 },
          { title: "Google Dorking", minutes: 8 },
        ],
      },
      {
        title: "Scanning Networks",
        lessons: [
          { title: "Network Scanning Basics", minutes: 9 },
          { title: "Using Nmap", minutes: 12 },
          { title: "Port Scanning Techniques", minutes: 10 },
          { title: "Vulnerability Scanning", minutes: 11 },
        ],
      },
      {
        title: "System Hacking Basics",
        lessons: [
          { title: "Password Cracking Concepts", minutes: 10 },
          { title: "Privilege Escalation Basics", minutes: 11 },
          { title: "Malware Overview", minutes: 9 },
          { title: "Social Engineering", minutes: 10 },
        ],
      },
      {
        title: "Web Application Attacks",
        lessons: [
          { title: "SQL Injection Basics", minutes: 12 },
          { title: "Cross-Site Scripting (XSS)", minutes: 11 },
          { title: "Common Web Vulnerabilities", minutes: 10 },
        ],
      },
      {
        title: "Reporting & Ethics",
        lessons: [
          { title: "Writing a Penetration Test Report", minutes: 11 },
          { title: "Responsible Disclosure", minutes: 8 },
          { title: "Career Paths in Security", minutes: 7 },
        ],
        project: {
          title: "Vulnerability Assessment Report",
          description: "Run a scan against a lab target and write a professional vulnerability assessment report with findings and remediation steps.",
          requirements: ["Scan a lab environment", "Document findings by severity", "Recommend remediations", "Follow responsible disclosure practices"],
          technologies: ["Nmap", "Reporting"],
          expectedFeatures: ["Executive summary", "Findings table with severity", "Remediation recommendations", "Clear, professional formatting"],
        },
      },
    ],
  },
  {
    slug: "network-security-essentials",
    tags: ["Cybersecurity"],
    skillsLearned: [
      "Explain core networking concepts and protocols",
      "Configure firewalls and access control",
      "Recognize common network-level attacks",
      "Monitor traffic and respond to incidents",
    ],
    modules: [
      {
        title: "Networking Fundamentals",
        lessons: [
          { title: "OSI Model Overview", minutes: 9 },
          { title: "TCP/IP Basics", minutes: 10 },
          { title: "Common Network Protocols", minutes: 9 },
          { title: "Network Devices Overview", minutes: 8 },
        ],
      },
      {
        title: "Firewalls & Access Control",
        lessons: [
          { title: "How Firewalls Work", minutes: 9 },
          { title: "Configuring Firewall Rules", minutes: 11 },
          { title: "Access Control Lists", minutes: 9 },
          { title: "VPN Basics", minutes: 10 },
        ],
      },
      {
        title: "Threats & Attacks",
        lessons: [
          { title: "Common Network Attacks", minutes: 10 },
          { title: "Denial of Service Attacks", minutes: 10 },
          { title: "Man-in-the-Middle Attacks", minutes: 11 },
          { title: "Packet Sniffing", minutes: 9 },
        ],
      },
      {
        title: "Monitoring & Detection",
        lessons: [
          { title: "Intrusion Detection Systems", minutes: 10 },
          { title: "Network Monitoring Tools", minutes: 9 },
          { title: "Log Analysis Basics", minutes: 9 },
          { title: "Analyzing Traffic with Wireshark", minutes: 13 },
        ],
      },
      {
        title: "Securing the Network",
        lessons: [
          { title: "Network Segmentation", minutes: 9 },
          { title: "Hardening Network Devices", minutes: 10 },
          { title: "Incident Response Basics", minutes: 10 },
        ],
        project: {
          title: "Home Network Security Audit",
          description: "Audit a home or lab network's configuration, identify weaknesses, and produce a hardening checklist.",
          requirements: ["Inventory connected devices", "Review firewall/router configuration", "Identify at least 3 weaknesses", "Produce a hardening checklist"],
          technologies: ["Networking", "Wireshark"],
          expectedFeatures: ["Device inventory", "Configuration review notes", "Prioritized findings", "Actionable hardening checklist"],
        },
      },
    ],
  },
  {
    slug: "machine-learning-basics",
    tags: ["Machine Learning"],
    skillsLearned: [
      "Prepare and clean data for a machine learning pipeline",
      "Train and evaluate regression and classification models",
      "Apply unsupervised learning techniques like clustering",
      "Tune models and build an end-to-end ML pipeline",
    ],
    modules: [
      {
        title: "Introduction to Machine Learning",
        lessons: [
          { title: "What is Machine Learning", minutes: 9 },
          { title: "Types of Machine Learning", minutes: 8 },
          { title: "The ML Workflow Overview", minutes: 9 },
          { title: "Setting Up Your Environment", minutes: 7 },
        ],
      },
      {
        title: "Data Preparation",
        lessons: [
          { title: "Collecting Data", minutes: 8 },
          { title: "Cleaning Data", minutes: 10 },
          { title: "Feature Scaling", minutes: 9 },
          { title: "Train/Test Split", minutes: 8 },
        ],
      },
      {
        title: "Supervised Learning — Regression",
        lessons: [
          { title: "Linear Regression", minutes: 12 },
          { title: "Evaluating Regression Models", minutes: 10 },
          { title: "Polynomial Regression", minutes: 11 },
          { title: "Regularization Basics", minutes: 11 },
        ],
      },
      {
        title: "Supervised Learning — Classification",
        lessons: [
          { title: "Logistic Regression", minutes: 12 },
          { title: "Decision Trees", minutes: 11 },
          { title: "k-Nearest Neighbors", minutes: 10 },
          { title: "Evaluating Classifiers", minutes: 11 },
        ],
        project: {
          title: "House Price Prediction Model",
          description: "Train and evaluate a regression model that predicts house prices from a real housing dataset.",
          requirements: ["Clean and preprocess the dataset", "Train a regression model", "Evaluate with appropriate metrics", "Summarize findings"],
          technologies: ["Python", "scikit-learn", "Pandas"],
          expectedFeatures: ["Data cleaning notebook", "Trained model", "Evaluation metrics (RMSE/R²)", "Written summary of results"],
        },
      },
      {
        title: "Unsupervised Learning",
        lessons: [
          { title: "K-Means Clustering", minutes: 11 },
          { title: "Hierarchical Clustering", minutes: 10 },
          { title: "Dimensionality Reduction Basics", minutes: 12 },
        ],
      },
      {
        title: "Model Improvement",
        lessons: [
          { title: "Cross-Validation", minutes: 10 },
          { title: "Hyperparameter Tuning", minutes: 12 },
          { title: "Overfitting & Underfitting", minutes: 9 },
          { title: "Ensemble Methods", minutes: 12 },
        ],
      },
      {
        title: "Putting It Together",
        lessons: [
          { title: "Building an End-to-End Pipeline", minutes: 14 },
          { title: "Model Deployment Basics", minutes: 10 },
          { title: "Next Steps in ML", minutes: 6 },
        ],
        project: {
          title: "Customer Segmentation Project",
          description: "Use clustering to segment customers from a retail dataset into meaningful groups and summarize each segment's traits.",
          requirements: ["Preprocess customer data", "Apply a clustering algorithm", "Interpret and label segments", "Visualize the segments"],
          technologies: ["Python", "scikit-learn", "Matplotlib"],
          expectedFeatures: ["Clustering pipeline", "Segment visualization", "Labeled segment profiles", "Written recommendations"],
        },
      },
    ],
  },
  {
    slug: "python-for-data-science",
    tags: ["Python"],
    skillsLearned: [
      "Work with NumPy arrays and vectorized operations",
      "Load, clean and wrangle data with Pandas",
      "Visualize data with Matplotlib and Seaborn",
      "Produce an end-to-end exploratory data analysis",
    ],
    modules: [
      {
        title: "Python Basics for Data",
        lessons: [
          { title: "Python Syntax Refresher", minutes: 8 },
          { title: "Working with Lists & Dicts", minutes: 9 },
          { title: "Functions & Loops Recap", minutes: 8 },
          { title: "Jupyter Notebook Basics", minutes: 7 },
        ],
      },
      {
        title: "NumPy Essentials",
        lessons: [
          { title: "Introduction to NumPy Arrays", minutes: 9 },
          { title: "Array Operations", minutes: 10 },
          { title: "Indexing & Slicing", minutes: 9 },
          { title: "Broadcasting Basics", minutes: 10 },
        ],
      },
      {
        title: "Pandas Fundamentals",
        lessons: [
          { title: "Series & DataFrames", minutes: 10 },
          { title: "Reading CSV Data", minutes: 8 },
          { title: "Filtering & Selecting Data", minutes: 10 },
          { title: "Handling Missing Data", minutes: 11 },
        ],
      },
      {
        title: "Data Cleaning & Wrangling",
        lessons: [
          { title: "Data Type Conversion", minutes: 8 },
          { title: "Grouping & Aggregating", minutes: 12 },
          { title: "Merging & Joining DataFrames", minutes: 11 },
          { title: "Pivot Tables", minutes: 10 },
        ],
      },
      {
        title: "Data Visualization",
        lessons: [
          { title: "Introduction to Matplotlib", minutes: 10 },
          { title: "Plotting with Pandas", minutes: 9 },
          { title: "Seaborn Basics", minutes: 10 },
          { title: "Building a Dashboard Chart", minutes: 12 },
        ],
      },
      {
        title: "Applied Analysis",
        lessons: [
          { title: "Exploratory Data Analysis", minutes: 13 },
          { title: "Summary Statistics", minutes: 8 },
          { title: "Correlation Analysis", minutes: 9 },
          { title: "Wrapping Up Your Analysis", minutes: 7 },
        ],
        project: {
          title: "Exploratory Data Analysis Report",
          description: "Perform a full exploratory data analysis on a real dataset and present findings with charts and a written summary.",
          requirements: ["Clean the dataset with Pandas", "Compute summary statistics", "Produce at least 3 visualizations", "Written summary of insights"],
          technologies: ["Python", "Pandas", "Matplotlib"],
          expectedFeatures: ["Cleaned dataset", "Summary statistics table", "Visualizations", "Written insights section"],
        },
      },
    ],
  },
  {
    slug: "react-native-fundamentals",
    tags: ["React Native"],
    skillsLearned: [
      "Build screens with React Native's core components",
      "Navigate between screens with React Navigation",
      "Fetch and display data from an API in a mobile app",
      "Use native device features and ship to a real device",
    ],
    modules: [
      {
        title: "Getting Started",
        lessons: [
          { title: "Introduction to React Native", minutes: 9 },
          { title: "Setting Up Expo", minutes: 8 },
          { title: "Project Structure Overview", minutes: 7 },
          { title: "Running on a Simulator", minutes: 8 },
        ],
      },
      {
        title: "Core Components",
        lessons: [
          { title: "View & Text", minutes: 7 },
          { title: "Images & Icons", minutes: 8 },
          { title: "ScrollView & FlatList", minutes: 10 },
          { title: "Styling with StyleSheet", minutes: 9 },
        ],
      },
      {
        title: "Navigation",
        lessons: [
          { title: "Setting Up React Navigation", minutes: 9 },
          { title: "Stack Navigators", minutes: 10 },
          { title: "Tab Navigators", minutes: 9 },
          { title: "Passing Params Between Screens", minutes: 9 },
        ],
      },
      {
        title: "State & Hooks in RN",
        lessons: [
          { title: "useState & useEffect in RN", minutes: 10 },
          { title: "Handling User Input", minutes: 9 },
          { title: "Forms in React Native", minutes: 11 },
          { title: "AsyncStorage Basics", minutes: 10 },
        ],
      },
      {
        title: "Working with APIs",
        lessons: [
          { title: "Fetching Data in RN", minutes: 10 },
          { title: "Handling Loading & Errors", minutes: 9 },
          { title: "Displaying API Data in Lists", minutes: 10 },
          { title: "Pull-to-Refresh", minutes: 8 },
        ],
        project: {
          title: "Weather App",
          description: "Build a weather app that fetches current conditions from a public API based on the user's searched city.",
          requirements: ["Search a city and fetch weather", "Display temperature and conditions", "Loading and error states", "Pull-to-refresh"],
          technologies: ["React Native", "Expo"],
          expectedFeatures: ["Search input", "Weather display card", "Loading/error handling", "Pull-to-refresh"],
        },
      },
      {
        title: "Native Features",
        lessons: [
          { title: "Using the Camera", minutes: 11 },
          { title: "Device Permissions", minutes: 9 },
          { title: "Push Notifications Basics", minutes: 12 },
          { title: "Handling Gestures", minutes: 10 },
        ],
      },
      {
        title: "Polishing & Shipping",
        lessons: [
          { title: "Animations with Reanimated", minutes: 13 },
          { title: "App Icons & Splash Screens", minutes: 8 },
          { title: "Testing on Real Devices", minutes: 9 },
          { title: "Preparing for App Store Submission", minutes: 11 },
        ],
        project: {
          title: "Habit Tracker App",
          description: "A polished habit-tracking app with local persistence, daily check-ins, and a streak counter, ready for app store submission.",
          requirements: ["Add/remove habits", "Daily check-in flow", "Streak tracking", "Data persists across app restarts"],
          technologies: ["React Native", "AsyncStorage"],
          expectedFeatures: ["Habit list", "Check-in interaction", "Streak counter", "Persisted state"],
        },
      },
    ],
  },
  {
    slug: "aws-cloud-practitioner",
    tags: ["AWS"],
    skillsLearned: [
      "Understand core cloud computing concepts",
      "Navigate core AWS services like EC2, S3 and IAM",
      "Choose the right AWS database for a workload",
      "Understand AWS billing, security and the exam format",
    ],
    modules: [
      {
        title: "Cloud Computing Basics",
        lessons: [
          { title: "What is Cloud Computing", minutes: 8 },
          { title: "Cloud Service Models", minutes: 9 },
          { title: "AWS Global Infrastructure", minutes: 9 },
        ],
      },
      {
        title: "AWS Core Services",
        lessons: [
          { title: "Introduction to EC2", minutes: 10 },
          { title: "S3 Storage Basics", minutes: 9 },
          { title: "IAM Fundamentals", minutes: 11 },
          { title: "VPC Basics", minutes: 10 },
        ],
      },
      {
        title: "Compute & Storage",
        lessons: [
          { title: "Launching an EC2 Instance", minutes: 12 },
          { title: "Configuring S3 Buckets", minutes: 10 },
          { title: "EBS vs S3", minutes: 8 },
        ],
        project: {
          title: "Deploy a Static Website on S3",
          description: "Host a static website on S3 with public read access configured correctly and a working live URL.",
          requirements: ["Create and configure an S3 bucket", "Enable static website hosting", "Set correct public access permissions", "Verify the live URL loads"],
          technologies: ["AWS S3"],
          expectedFeatures: ["S3 bucket configured for hosting", "Correct bucket policy", "Working public URL", "Basic index/error pages"],
        },
      },
      {
        title: "Databases on AWS",
        lessons: [
          { title: "Introduction to RDS", minutes: 9 },
          { title: "DynamoDB Basics", minutes: 10 },
          { title: "Choosing the Right Database", minutes: 8 },
        ],
      },
      {
        title: "Security & Billing",
        lessons: [
          { title: "AWS Shared Responsibility Model", minutes: 8 },
          { title: "Billing & Cost Management", minutes: 9 },
          { title: "AWS Free Tier Overview", minutes: 7 },
          { title: "Setting Up Budgets & Alerts", minutes: 8 },
        ],
      },
      {
        title: "Exam Prep",
        lessons: [
          { title: "AWS Well-Architected Framework", minutes: 10 },
          { title: "Practice Questions Walkthrough", minutes: 14 },
          { title: "Certification Exam Tips", minutes: 6 },
        ],
      },
    ],
  },
  {
    slug: "product-management-basics",
    tags: ["Product Management"],
    skillsLearned: [
      "Understand the product manager's role and lifecycle",
      "Prioritize features using common PM frameworks",
      "Write user stories and build a product roadmap",
      "Define success metrics and iterate after launch",
    ],
    modules: [
      {
        title: "Introduction to Product Management",
        lessons: [
          { title: "What Does a PM Do", minutes: 8 },
          { title: "Product vs Project Management", minutes: 7 },
          { title: "Product Lifecycle Overview", minutes: 8 },
          { title: "Key PM Skills", minutes: 7 },
        ],
      },
      {
        title: "Discovery & Strategy",
        lessons: [
          { title: "Understanding User Needs", minutes: 9 },
          { title: "Writing a Product Vision", minutes: 8 },
          { title: "Competitive Analysis Basics", minutes: 9 },
          { title: "Prioritization Frameworks", minutes: 10 },
        ],
      },
      {
        title: "Planning & Execution",
        lessons: [
          { title: "Writing User Stories", minutes: 9 },
          { title: "Building a Product Roadmap", minutes: 10 },
          { title: "Working with Engineering Teams", minutes: 8 },
          { title: "Agile & Scrum Basics", minutes: 10 },
        ],
      },
      {
        title: "Launch & Metrics",
        lessons: [
          { title: "Planning a Product Launch", minutes: 9 },
          { title: "Defining Success Metrics", minutes: 9 },
          { title: "Gathering User Feedback", minutes: 8 },
          { title: "Iterating After Launch", minutes: 8 },
        ],
      },
    ],
  },
  {
    slug: "html-fundamentals",
    tags: ["HTML"],
    skillsLearned: [
      "Structure documents with semantic HTML",
      "Build lists, tables and nested elements",
      "Create accessible forms",
      "Embed media and follow HTML best practices",
    ],
    modules: [
      {
        title: "HTML Basics",
        lessons: [
          { title: "What is HTML", minutes: 6 },
          { title: "Document Structure", minutes: 7 },
          { title: "Headings & Paragraphs", minutes: 6 },
          { title: "Links & Images", minutes: 7 },
        ],
      },
      {
        title: "Lists & Tables",
        lessons: [
          { title: "Ordered & Unordered Lists", minutes: 6 },
          { title: "Building Tables", minutes: 8 },
          { title: "Nesting Elements", minutes: 7 },
          { title: "Semantic HTML Tags", minutes: 8 },
        ],
      },
      {
        title: "Forms",
        lessons: [
          { title: "Form Basics", minutes: 7 },
          { title: "Input Types", minutes: 8 },
          { title: "Labels & Accessibility", minutes: 8 },
          { title: "Submitting Forms", minutes: 7 },
        ],
      },
      {
        title: "Media & Best Practices",
        lessons: [
          { title: "Embedding Video & Audio", minutes: 7 },
          { title: "HTML5 Semantic Layout", minutes: 8 },
          { title: "Validating Your HTML", minutes: 6 },
          { title: "Best Practices Recap", minutes: 6 },
        ],
      },
    ],
  },
];

async function main() {
  await connectDB();

  for (const spec of COURSES) {
    // eslint-disable-next-line no-await-in-loop
    const course = await Course.findOne({ slug: spec.slug });
    if (!course) {
      // eslint-disable-next-line no-console
      console.warn(`[seed] skipping ${spec.slug} — course not found`);
      // eslint-disable-next-line no-continue
      continue;
    }

    course.pdfUrl = PDF_URL;
    course.tags = spec.tags;
    course.skillsLearned = spec.skillsLearned;

    // eslint-disable-next-line no-await-in-loop
    const existingModules = await Module.find({ course: course._id });
    const existingModuleIds = existingModules.map((m) => m._id);
    // eslint-disable-next-line no-await-in-loop
    await Lesson.deleteMany({ course: course._id });
    // eslint-disable-next-line no-await-in-loop
    await Project.deleteMany({ course: course._id });
    // eslint-disable-next-line no-await-in-loop
    await Module.deleteMany({ _id: { $in: existingModuleIds } });

    let lessonCount = 0;
    let projectCount = 0;

    for (const [moduleIndex, moduleSpec] of spec.modules.entries()) {
      // eslint-disable-next-line no-await-in-loop
      const mod = await Module.create({
        course: course._id,
        title: moduleSpec.title,
        order: moduleIndex,
        isPublished: true,
      });

      for (const [lessonIndex, lessonSpec] of moduleSpec.lessons.entries()) {
        // eslint-disable-next-line no-await-in-loop
        await Lesson.create({
          module: mod._id,
          course: course._id,
          title: lessonSpec.title,
          videoProvider: null,
          estimatedMinutes: Math.round(lessonSpec.minutes),
          order: lessonIndex,
          isPublished: true,
        });
        lessonCount += 1;
      }

      if (moduleSpec.project) {
        // eslint-disable-next-line no-await-in-loop
        await Project.create({
          module: mod._id,
          course: course._id,
          title: moduleSpec.project.title,
          description: moduleSpec.project.description,
          requirements: moduleSpec.project.requirements,
          technologies: moduleSpec.project.technologies,
          difficulty: course.difficulty,
          expectedFeatures: moduleSpec.project.expectedFeatures,
        });
        projectCount += 1;
      }
    }

    course.moduleCount = spec.modules.length;
    course.lessonCount = lessonCount;
    course.projectCount = projectCount;
    // eslint-disable-next-line no-await-in-loop
    await course.save();

    // eslint-disable-next-line no-console
    console.log(`[seed] ${spec.slug}: ${spec.modules.length} modules, ${lessonCount} lessons, ${projectCount} project(s)`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[seed] failed", err);
  process.exit(1);
});
