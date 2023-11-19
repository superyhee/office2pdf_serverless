const AWS = require("aws-sdk");
const fs = require("fs").promises;
const path = require("path");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const gm = require("gm").subClass({ imageMagick: true });

const s3 = new AWS.S3();
const ALLOWED_EXTENSIONS = new Set(["pdf"]);

exports.handler = async (event) => {
  try {
    const record = event.Records[0].s3;
    const bucket = record.bucket.name;
    const s3Key = decodeURI(record.object.key);

    // 获取文件扩展名
    const fileExtension = path.extname(s3Key).toLowerCase().slice(1);

    if (ALLOWED_EXTENSIONS.has(fileExtension)) {
      // 文件为PDF，只生成PDF缩略图

      const pdfParams = { Bucket: bucket, Key: s3Key };
      const pdfData = await s3.getObject(pdfParams).promise();
      const { base: srcKey, name: srcName } = path.parse(s3Key);

      // 将整个PDF文件保存到本地
      const pdfFilePath = `/tmp/${srcName}.pdf`;
      await fs.writeFile(pdfFilePath, pdfData.Body);

      // 生成PDF缩略图
      const thumbnailPath = `/tmp/${srcName}_thumbnail.jpg`;
      await new Promise((resolve, reject) => {
        gm(pdfFilePath + "[0]") // 处理PDF文件的第一页
          .thumbnail(300, null)
          .background("white")
          .noProfile()
          .write(thumbnailPath, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
      });

      // 上传PDF缩略图到S3
      const thumbnailData = await fs.readFile(thumbnailPath);
      const thumbnailKey = path.join(
        path.dirname(s3Key),
        `${srcName}_thumbnail.jpg`
      );
      const thumbnailParams = {
        Bucket: bucket,
        Key: thumbnailKey,
        Body: thumbnailData,
      };
      await s3.putObject(thumbnailParams).promise();
      // 返回成功的响应
      return {
        statusCode: 200,
        body: JSON.stringify(
          "PDF Thumbnail generated and uploaded successfully"
        ),
      };
    } else {
      // 文件不是PDF，执行LibreOffice转换和其他处理代码

      const { base: srcKey, name: srcName } = path.parse(s3Key);
      const dstKey = path.join(path.dirname(s3Key), `${srcName}.pdfx`);

      // 下载文件到本地
      const params = { Bucket: bucket, Key: s3Key };
      const data = await s3.getObject(params).promise();
      await fs.writeFile(`/tmp/${srcKey}`, data.Body);

      // Execute conversion command
      const LIBRE_OFFICE_COMMAND =
        "libreoffice7.4 --headless --invisible --nodefault --view --nolockcheck --nologo --norestore --convert-to pdf --outdir /tmp /tmp/";
      await exec(`${LIBRE_OFFICE_COMMAND}${srcKey}`);

      // Upload PDF file
      const pdfData = await fs.readFile(`/tmp/${srcName}.pdf`);
      const pdfParams = { Bucket: bucket, Key: dstKey, Body: pdfData };

      // ...（其他处理，例如生成PDF缩略图等）

      // Upload PDF thumbnail using GraphicsMagick
      const thumbnailPath = `/tmp/${srcName}_thumbnail.jpg`;
      await new Promise((resolve, reject) => {
        gm(`/tmp/${srcName}.pdf[0]`)
          .thumbnail(300, null)
          .background("white")
          .noProfile()
          .write(thumbnailPath, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
      });

      // Upload PDF thumbnail
      const thumbnailData = await fs.readFile(thumbnailPath);
      const thumbnailKey = path.join(
        path.dirname(s3Key),
        `${srcName}_thumbnail.jpg`
      );
      const thumbnailParams = {
        Bucket: bucket,
        Key: thumbnailKey,
        Body: thumbnailData,
      };

      await Promise.all([
        s3.putObject(pdfParams).promise(),
        s3.putObject(thumbnailParams).promise(),
        s3.deleteObject(params).promise(),
      ]);

      return {
        statusCode: 200,
        body: JSON.stringify("Conversion successful"),
      };
    }
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify(`Error converting file: ${err.message}`),
    };
  }
};
