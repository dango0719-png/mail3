require('dotenv').config();
const express = require('express');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');

const app = express();
const port = 3000;

// Phục vụ các file tĩnh trong thư mục 'public' (HTML, JS, CSS)
app.use(express.static('public'));

// Hàm khởi tạo kết nối IMAP
const getImapClient = () => {
    return new ImapFlow({
        host: process.env.IMAP_HOST,
        port: parseInt(process.env.IMAP_PORT),
        secure: process.env.IMAP_SECURE === 'true',
        auth: {
            user: process.env.IMAP_USER,
            pass: process.env.IMAP_PASS
        },
        logger: false // Tắt log cho gọn
    });
};

// API: Lấy danh sách 50 mail mới nhất
app.get('/api/mails', async (req, res) => {
    const client = getImapClient();
    try {
        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        try {
            const messages = [];
            const exists = client.mailbox.exists;
            // Lấy 50 mail cuối cùng (IMAP sequence bắt đầu từ 1)
            const seq = exists > 50 ? `${exists - 49}:*` : '1:*';

            for await (let msg of client.fetch(seq, { envelope: true, uid: true })) {
                messages.push({
                    id: msg.uid,
                    from: msg.envelope.from.map(f => f.address).join(', '),
                    subject: msg.envelope.subject || '(Không có tiêu đề)',
                    date: msg.envelope.date
                });
            }
            // Đảo ngược để mail mới nhất lên đầu
            res.json(messages.reverse());
        } finally {
            lock.release();
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        await client.logout();
    }
});

// API: Lấy nội dung chi tiết của 1 mail theo UID
app.get('/api/mails/:id', async (req, res) => {
    const client = getImapClient();
    try {
        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        try {
            // Lấy toàn bộ source chuẩn RFC822 của mail
            const msg = await client.fetchOne(req.params.id, { source: true }, { uid: true });
            if (!msg) return res.status(404).send('Không tìm thấy mail');

            // Dùng mailparser để bóc tách multipart, html, text tự động
            const parsed = await simpleParser(msg.source);
            res.json({
                subject: parsed.subject,
                body: parsed.html || `<pre>${parsed.textAsHtml || parsed.text}</pre>`
            });
        } finally {
            lock.release();
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    } finally {
        await client.logout();
    }
});

app.listen(port, () => {
    console.log(`Server đang chạy tại http://localhost:${port}`);
});