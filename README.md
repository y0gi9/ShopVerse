# ShopVerse

ShopVerse is a modern product showcase and admin management web application built with Node.js, Express, SQLite, and EJS. It empowers admins to manage products, upload images, and handle authentication. ShopVerse supports local image storage, is ready for AWS S3 integration, and features a global contact method toggle (Email/SMS) with an admin-editable phone number.

## Features
- Product listing and showcase
- Admin authentication (with super admin support)
- Add, edit, and delete products (with image upload)
- Admin user management (super admin only)
- EJS templating and Tailwind CSS for UI
- Global contact method toggle (Email/SMS) from the admin panel
- Admin-editable contact phone number (for SMS inquiries)
- Ready for S3 image hosting

## Getting Started

### Prerequisites
- Node.js (v16 or higher recommended)
- npm
- (Optional) AWS account and S3 bucket for production image hosting

### Installation
1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd shopverse
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create the uploads directory for local image storage:
   ```bash
   mkdir -p public/uploads
   ```
4. Create a `.env` file in the project root:
   ```env
   PORT=3000
   UPLOAD_DIR=public/uploads
   SESSION_SECRET=your_session_secret
   SUPER_ADMIN_USERNAME=admin
   SUPER_ADMIN_PASSWORD=admin123
   CONTACT_EMAIL=your-email@example.com
   # CONTACT_PHONE is now set in the admin panel
   ```

### Running Locally
```bash
node app.js
```
Visit [http://localhost:3000](http://localhost:3000) in your browser.

### Systemd Service (Linux)
To run the app as a service on Linux, create a systemd service file:
```ini
[Unit]
Description=ShopVerse Application
After=network.target

[Service]
Type=simple
User=yourusername
WorkingDirectory=/path/to/shopverse
ExecStart=/usr/bin/node app.js
Restart=on-failure
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin
TimeoutStartSec=30

[Install]
WantedBy=multi-user.target
```
Then enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable shopverse
sudo systemctl start shopverse
```

### Image Uploads
- **Local:** Images are stored in `public/uploads` and served at `/uploads/filename.png`.
- **S3 (Production):**
  - Update the upload logic in `app.js` to use AWS SDK and upload images to your S3 bucket.
  - Store the S3 URL in the database and use it in your EJS templates.

### Environment Variables
| Variable             | Description                        |
|----------------------|------------------------------------|
| PORT                 | Port to run the server on           |
| UPLOAD_DIR           | Directory for image uploads         |
| SESSION_SECRET       | Secret for session encryption       |
| SUPER_ADMIN_USERNAME | Default super admin username        |
| SUPER_ADMIN_PASSWORD | Default super admin password        |
| CONTACT_EMAIL        | Contact email for inquiries         |

### Admin Features
- Login at `/admin/login`
- Manage products at `/admin`
- Super admin can manage users at `/admin/users`
- Super admin can set the global contact method (Email/SMS) and the contact phone number for SMS in the admin dashboard

### S3 Integration (Optional)
1. Install AWS SDK:
   ```bash
   npm install aws-sdk
   ```
2. Update your upload logic in `app.js` to upload files to S3 and store the S3 URL in the database.
3. Update your EJS templates to use the S3 URL for images.

---

## License
MIT 