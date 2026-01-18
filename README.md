# 🦁 The Menagerie

A collection of web projects, SPAs, utilities, and experiments hosted on GitHub Pages.

## Structure

Each project lives in its own directory at the root level:

```
menagerie/
├── index.html          # Main landing page
├── README.md           # This file
├── project-one/        # Individual project folder
│   └── index.html
├── project-two/        # Another project
│   └── index.html
└── ...
```

## Adding a New Project

1. Create a new folder at the root level with your project name
2. Add your project files (including an `index.html` as the entry point)
3. Update the `projects` array in `index.html` to add your project to the catalog:

```javascript
const projects = [
    {
        name: "My Project",
        description: "Brief description of what this project does",
        url: "./my-project/",
        tag: "Utility"  // Optional: "Utility", "Game", "Tool", "SPA", etc.
    }
];
```

## Publishing to GitHub Pages

1. Go to your repository Settings
2. Navigate to "Pages" in the sidebar
3. Under "Source", select the `main` branch
4. Save and wait for the deployment

Your site will be available at: `https://[username].github.io/menagerie/`

## License

Individual projects may have their own licenses. Check each project directory for details.
