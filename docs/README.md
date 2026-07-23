<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/e4984c2e-c55e-476c-b939-6e93b646abdb

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Set `ADMIN_SECRET` in `.env.local` for admin write APIs (timeline/assets upload/update/delete)
4. Optional: set `MAX_UPLOAD_MB` (default `10`) to control image upload limit
5. Run the app:
   `npm run dev`
