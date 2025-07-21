require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Set to true if using HTTPS
}));

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, process.env.UPLOAD_DIR)
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname)
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Not an image! Please upload an image.'), false);
        }
    }
});

// Authentication middleware
const requireAuth = (req, res, next) => {
    if (req.session.isAuthenticated) {
        next();
    } else {
        res.redirect('/admin/login');
    }
};

// Admin management middleware (only super admin can access)
const requireSuperAdmin = (req, res, next) => {
    if (req.session.isAuthenticated && req.session.isSuperAdmin) {
        next();
    } else {
        res.redirect('/admin');
    }
};

// SQLite Database Setup
const db = new sqlite3.Database('./database.sqlite', (err) => {
    if (err) console.error(err.message);
    console.log('Connected to SQLite database.');
});

// Auto-create tables
db.serialize(() => {
    // Products table
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        image TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Drop existing admin_users table if it exists
    db.run('DROP TABLE IF EXISTS admin_users');

    // Create admin users table with proper schema
    db.run(`CREATE TABLE admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_super_admin INTEGER DEFAULT 0
    )`);

    // Insert default admin with super admin privileges
    const defaultPassword = process.env.SUPER_ADMIN_PASSWORD;
    bcrypt.hash(defaultPassword, 10, (err, hash) => {
        if (err) {
            console.error(err.message);
            return;
        }
        db.run('INSERT INTO admin_users (username, password, is_super_admin) VALUES (?, ?, ?)', 
            [process.env.SUPER_ADMIN_USERNAME, hash, 1],
            (err) => {
                if (err) console.error(err.message);
                console.log('Default admin user created with super admin privileges');
            }
        );
    });

    // Settings table for global contact method
    db.run(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);
    // Initialize contact_method if not set
    db.get('SELECT value FROM settings WHERE key = ?', ['contact_method'], (err, row) => {
        if (!row) {
            db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['contact_method', 'email']);
        }
    });
    // Initialize contact_phone if not set
    db.get('SELECT value FROM settings WHERE key = ?', ['contact_phone'], (err, row) => {
        if (!row) {
            db.run('INSERT INTO settings (key, value) VALUES (?, ?)', ['contact_phone', '']);
        }
    });
});

// Helper to get contact method
function getContactMethod(cb) {
    db.get('SELECT value FROM settings WHERE key = ?', ['contact_method'], (err, row) => {
        if (err) return cb(err, 'email');
        cb(null, row ? row.value : 'email');
    });
}

// Helper to set contact method
function setContactMethod(method, cb) {
    db.run('UPDATE settings SET value = ? WHERE key = ?', [method, 'contact_method'], cb);
}

// Helper to get contact phone
function getContactPhone(cb) {
    db.get('SELECT value FROM settings WHERE key = ?', ['contact_phone'], (err, row) => {
        if (err) return cb(err, '');
        cb(null, row ? row.value : '');
    });
}

// Helper to set contact phone
function setContactPhone(phone, cb) {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['contact_phone', phone], cb);
}

// Routes
app.get('/', (req, res) => {
    db.all('SELECT * FROM products', [], (err, products) => {
        if (err) return res.status(500).send(err.message);
        getContactMethod((err, contactMethod) => {
            getContactPhone((err, contactPhone) => {
                res.render('products', { products, contactMethod, contactEmail: process.env.CONTACT_EMAIL, contactPhone });
            });
        });
    });
});

// Admin routes
app.get('/admin/login', (req, res) => {
    res.render('admin/login');
});

app.post('/admin/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM admin_users WHERE username = ?', [username], (err, user) => {
        if (err) {
            console.error(err);
            return res.render('admin/login', { error: 'Database error' });
        }
        if (!user) {
            return res.render('admin/login', { error: 'Invalid credentials' });
        }
        
        bcrypt.compare(password, user.password, (err, match) => {
            if (err) {
                console.error(err);
                return res.render('admin/login', { error: 'Error during authentication' });
            }
            if (match) {
                console.log('User data:', {
                    id: user.id,
                    username: user.username,
                    is_super_admin: user.is_super_admin
                });
                
                req.session.isAuthenticated = true;
                req.session.userId = user.id;
                req.session.username = user.username;
                req.session.isSuperAdmin = Boolean(user.is_super_admin);
                
                console.log('Session after login:', {
                    isAuthenticated: req.session.isAuthenticated,
                    isSuperAdmin: req.session.isSuperAdmin,
                    username: req.session.username
                });
                
                res.redirect('/admin');
            } else {
                res.render('admin/login', { error: 'Invalid credentials' });
            }
        });
    });
});

app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

app.get('/admin', requireAuth, (req, res) => {
    db.all('SELECT * FROM products', [], (err, products) => {
        if (err) return res.status(500).send(err.message);
        getContactMethod((err, contactMethod) => {
            getContactPhone((err, contactPhone) => {
                res.render('admin/index', {
                    products,
                    username: req.session.username,
                    isSuperAdmin: Boolean(req.session.isSuperAdmin),
                    contactMethod,
                    contactPhone
                });
            });
        });
    });
});

// Handle contact method update
app.post('/admin/contact-method', requireAuth, (req, res) => {
    if (!req.session.isSuperAdmin) return res.status(403).send('Forbidden');
    const method = req.body.contactMethod === 'sms' ? 'sms' : 'email';
    setContactMethod(method, (err) => {
        if (err) return res.status(500).send('Failed to update contact method');
        res.redirect('/admin');
    });
});

app.get('/admin/create', requireAuth, (req, res) => {
    res.render('admin/create');
});

app.post('/admin/store', requireAuth, upload.single('image'), (req, res) => {
    const { name, description } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;
    
    db.run('INSERT INTO products (name, description, image) VALUES (?, ?, ?)', 
        [name, description, image], 
        (err) => {
            if (err) return res.status(500).send(err.message);
            res.redirect('/admin');
        }
    );
});

// Add delete product route
app.post('/admin/delete/:id', requireAuth, (req, res) => {
    const productId = req.params.id;
    db.get('SELECT image FROM products WHERE id = ?', [productId], (err, product) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Error deleting product');
        }
        
        // Delete the image file if it exists
        if (product && product.image) {
            const imagePath = path.join(__dirname, product.image);
            fs.unlink(imagePath, (err) => {
                if (err) console.error('Error deleting image file:', err);
            });
        }
        
        // Delete from database
        db.run('DELETE FROM products WHERE id = ?', [productId], (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Error deleting product');
            }
            res.redirect('/admin');
        });
    });
});

// Admin management routes
app.get('/admin/users', requireSuperAdmin, (req, res) => {
    db.all('SELECT id, username, created_at, is_super_admin FROM admin_users', [], (err, users) => {
        if (err) return res.status(500).send(err.message);
        res.render('admin/users', { 
            users,
            username: req.session.username,
            error: req.query.error
        });
    });
});

app.get('/admin/users/create', requireSuperAdmin, (req, res) => {
    res.render('admin/create-user');
});

app.post('/admin/users/store', requireSuperAdmin, (req, res) => {
    const { username, password, is_super_admin } = req.body;
    
    // Check if username already exists
    db.get('SELECT id FROM admin_users WHERE username = ?', [username], (err, existingUser) => {
        if (err) return res.status(500).send(err.message);
        if (existingUser) {
            return res.render('admin/create-user', { error: 'Username already exists' });
        }
        
        // Hash password and create user
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return res.status(500).send(err.message);
            
            db.run('INSERT INTO admin_users (username, password, is_super_admin) VALUES (?, ?, ?)',
                [username, hash, is_super_admin === 'on' ? 1 : 0],
                (err) => {
                    if (err) return res.status(500).send(err.message);
                    res.redirect('/admin/users');
                }
            );
        });
    });
});

app.post('/admin/users/delete/:id', requireSuperAdmin, (req, res) => {
    const userId = req.params.id;
    
    // Prevent deleting the last super admin
    db.get('SELECT COUNT(*) as count FROM admin_users WHERE is_super_admin = 1', [], (err, row) => {
        if (err) return res.status(500).send(err.message);
        
        if (row.count <= 1) {
            db.get('SELECT is_super_admin FROM admin_users WHERE id = ?', [userId], (err, user) => {
                if (err) return res.status(500).send(err.message);
                if (user && user.is_super_admin === 1) {
                    return res.redirect('/admin/users?error=Cannot delete the last super admin');
                }
            });
        }
        
        db.run('DELETE FROM admin_users WHERE id = ?', [userId], (err) => {
            if (err) return res.status(500).send(err.message);
            res.redirect('/admin/users');
        });
    });
});

// Add this route before the 404 handler
app.get('/fix-admin', (req, res) => {
    db.run('UPDATE admin_users SET is_super_admin = 1 WHERE username = ?', 
        [process.env.SUPER_ADMIN_USERNAME], 
        (err) => {
            if (err) {
                console.error(err);
                return res.send('Error updating admin: ' + err.message);
            }
            res.send('Admin updated to super admin successfully!');
        }
    );
});

// Add POST route to update phone number
app.post('/admin/contact-phone', requireAuth, (req, res) => {
    if (!req.session.isSuperAdmin) return res.status(403).send('Forbidden');
    const phone = req.body.contactPhone || '';
    setContactPhone(phone, (err) => {
        if (err) return res.status(500).send('Failed to update phone number');
        res.redirect('/admin');
    });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).send('404 - Page Not Found');
});

// Start Server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});