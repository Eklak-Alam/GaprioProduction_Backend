const nodemailer = require('nodemailer');

// 1. Configure cPanel SMTP (Secure SSL)
const transporter = nodemailer.createTransport({
    host: 'gaprio.in',
    port: 465,
    secure: true, // Use SSL
    auth: {
        user: 'support@gaprio.in',
        pass: process.env.SMTP_PASSWORD
    },
});

exports.sendOTP = async (email, otp) => {
    try {
        console.log(`📧 Sending OTP to ${email}...`);
        console.log(`🔐 DEV MODE OTP: ${otp}`); // Allow login without email access

        const mailOptions = {
            from: '"Gaprio Security" <support@gaprio.in>',
            to: email,
            subject: `🔐 ${otp} is your Gaprio verification code`,
            text: `Your Gaprio verification code is ${otp}. This code expires in 10 minutes.`,
            html: `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gaprio Verification</title>
    <style>
        body { margin: 0; padding: 0; background-color: #000000; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
        .wrapper { width: 100%; table-layout: fixed; background-color: #000000; padding: 40px 0; }
        .main-table { background-color: #050505; margin: 0 auto; width: 100%; max-width: 500px; border-spacing: 0; border: 1px solid #1f1f1f; border-radius: 12px; }
        
        /* Header Style (CSS Logo) */
        .header-cell { padding: 40px 40px 20px 40px; text-align: left; }
        .brand-text { font-size: 24px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px; text-decoration: none; }
        .brand-dot { color: #ea580c; } /* Orange Dot */

        /* Content */
        .content-cell { padding: 0 40px 40px 40px; }
        .title { font-size: 18px; font-weight: 500; color: #e4e4e7; margin: 0 0 16px 0; }
        .text { font-size: 15px; line-height: 24px; color: #a1a1aa; margin: 0 0 24px 0; }
        
        /* Premium OTP Box */
        .otp-box { 
            background-color: #0a0a0a; 
            border: 1px solid #27272a; 
            border-radius: 8px; 
            padding: 20px; 
            text-align: center; 
            margin-bottom: 24px;
        }
        .otp-code { 
            font-family: 'SF Mono', 'Consolas', 'Courier New', monospace; 
            font-size: 32px; 
            font-weight: 700; 
            color: #ea580c; 
            letter-spacing: 6px; 
            margin: 0; 
        }

        /* Footer */
        .footer-cell { padding: 20px 40px; background-color: #050505; border-top: 1px solid #1f1f1f; text-align: center; }
        .footer-text { font-size: 12px; color: #52525b; line-height: 18px; margin: 0; }
        .link { color: #71717a; text-decoration: underline; }
    </style>
</head>
<body>
    <div class="wrapper">
        <table class="main-table" role="presentation">
            <tr>
                <td class="header-cell">
                    <span class="brand-text">Gaprio<span class="brand-dot">.</span></span>
                </td>
            </tr>

            <tr>
                <td class="content-cell">
                    <h1 class="title">Authenticate Request</h1>
                    <p class="text">
                        A login attempt requires verification. Use the secure code below to access your <strong>Neural Core</strong> workspace.
                    </p>

                    <div class="otp-box">
                        <p class="otp-code">${otp}</p>
                    </div>

                    <p class="text" style="margin-bottom: 0; font-size: 13px;">
                        This code is valid for <strong>10 minutes</strong>. If you did not request this, please ignore this email.
                    </p>
                </td>
            </tr>

            <tr>
                <td class="footer-cell">
                    <p class="footer-text">
                        Secured by Gaprio Infrastructure<br>
                        &copy; ${new Date().getFullYear()} Gaprio Inc.
                    </p>
                </td>
            </tr>
        </table>
    </div>
</body>
</html>
            `
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ OTP sent successfully to ${email}`);

    } catch (error) {
        console.error("❌ Email Sending Failed:", error.message);
        // throw new Error("Failed to send verification email."); // Don't block dev flow
    }
};