const express = require("express");
const mysql = require("mysql");
const cors = require("cors");
const app = express();
const PORT = 8080; // Backend chạy trên Port 8080

// Cấu hình kết nối RDS MySQL
// *** THAY THẾ CÁC GIÁ TRỊ SAU VỚI ENDPOINT VÀ THÔNG TIN CỦA BẠN ***
const dbConfig = {
  host: "db-tuyensinh-bdu.c54m4emukwk3.ap-southeast-1.rds.amazonaws.com",
  user: "root",
  password: "anhthaem",
  database: "db-tuyensinh-bdu",
  multipleStatements: false,
};

// Tạo kết nối DB với cơ chế reconnect đơn giản
let connection;
function handleDisconnect() {
  connection = mysql.createConnection(dbConfig);

  connection.connect((err) => {
    if (err) {
      console.error("Lỗi kết nối DB: ", err);
      setTimeout(handleDisconnect, 2000);
      return;
    }
    console.log("Kết nối DB thành công, ID: " + connection.threadId);
  });

  connection.on("error", (err) => {
    console.error("Lỗi DB:", err);
    if (err.code === "PROTOCOL_CONNECTION_LOST") {
      handleDisconnect();
    } else {
      throw err;
    }
  });
}
handleDisconnect();

// Middleware
app.use(express.json());
app.use(cors());

// Route base: prefix /api
const api = express.Router();

// GET /api/programs - danh sách chương trình
api.get("/programs", (req, res) => {
  const q = "SELECT id, code, name, degree, capacity FROM programs ORDER BY id";
  connection.query(q, (err, results) => {
    if (err) {
      console.error("DB Error /programs:", err);
      return res.status(500).json({ error: "Lỗi truy vấn cơ sở dữ liệu." });
    }
    res.json(results);
  });
});

// POST /api/apply - nộp hồ sơ
// Body: { full_name, email, phone?, program_id, notes? }
api.post("/apply", async (req, res) => {
  const { full_name, email, phone, program_id, notes } = req.body || {};
  if (!full_name || !email || !program_id) {
    return res
      .status(400)
      .json({
        error: "Thiếu thông tin bắt buộc (full_name, email, program_id).",
      });
  }

  // Thực hiện 2 bước: tạo applicant => tạo application
  connection.beginTransaction((txErr) => {
    if (txErr) {
      console.error("TX start error:", txErr);
      return res.status(500).json({ error: "Không thể bắt đầu giao dịch DB." });
    }

    const insertApplicant =
      "INSERT INTO applicants (full_name, email, phone) VALUES (?, ?, ?)";
    connection.query(
      insertApplicant,
      [full_name, email, phone || null],
      (aErr, aRes) => {
        if (aErr) {
          console.error("Insert applicant error:", aErr);
          return connection.rollback(() =>
            res.status(500).json({ error: "Lỗi khi lưu ứng viên." })
          );
        }

        const applicantId = aRes.insertId;
        const insertApp =
          "INSERT INTO applications (applicant_id, program_id, notes) VALUES (?, ?, ?)";
        connection.query(
          insertApp,
          [applicantId, program_id, notes || null],
          (apErr, apRes) => {
            if (apErr) {
              console.error("Insert application error:", apErr);
              return connection.rollback(() =>
                res.status(500).json({ error: "Lỗi khi lưu hồ sơ." })
              );
            }

            connection.commit((cErr) => {
              if (cErr) {
                console.error("Commit error:", cErr);
                return connection.rollback(() =>
                  res.status(500).json({ error: "Lỗi khi lưu hồ sơ (commit)." })
                );
              }
              return res
                .status(201)
                .json({
                  message: "Nộp hồ sơ thành công.",
                  applicationId: apRes.insertId,
                });
            });
          }
        );
      }
    );
  });
});

// Backward-compatible: trả danh sách students nếu cần
api.get("/students", (req, res) => {
  const q = "SELECT id, name, major FROM students";
  connection.query(q, (err, results) => {
    if (err) {
      console.error("DB Error /students:", err);
      return res
        .status(500)
        .json({ error: "Không thể truy vấn cơ sở dữ liệu." });
    }
    res.json(results);
  });
});

app.use("/api", api);

// Serve a health check
app.get("/", (req, res) => res.send("BDU Tuyển sinh Backend đang hoạt động"));

// Khởi động server
app.listen(PORT, () => {
  console.log(`Backend server đang chạy trên port ${PORT}`);
});
