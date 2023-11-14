const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const util = require("util");
const libreofficeConvert = require("libreoffice-convert");

const s3 = new AWS.S3();

const convertToPdf = async (inputFilePath, outputFilePath) => {
  const readFile = util.promisify(fs.readFile);
  const writeFile = util.promisify(fs.writeFile);

  try {
    // Read the input Office file
    const inputFile = await readFile(inputFilePath);

    // Convert the Office file to PDF
    const pdfBuffer = await libreofficeConvert(
      inputFile,
      ".pdf",
      undefined,
      []
    );

    // Write the PDF to the specified output file
    await writeFile(outputFilePath, pdfBuffer);

    console.log("Conversion successful.");
  } catch (error) {
    console.error("Error converting file:", error);
    throw error;
  }
};

exports.handler = async (event) => {
  const inputBucket = event.Records[0].s3.bucket.name;
  const inputKey = event.Records[0].s3.object.key;

  const outputBucket = "your-output-bucket-name"; // Replace with your output S3 bucket name
  const outputKey = inputKey.replace(/\.[^.]+$/, ".pdf"); // Change file extension to '.pdf'

  const inputFilePath = `/tmp/${inputKey}`;
  const outputFilePath = `/tmp/${outputKey}`;

  try {
    // Download the input file from S3
    await s3.getObject({ Bucket: inputBucket, Key: inputKey }).promise();

    // Convert the Office file to PDF
    await convertToPdf(inputFilePath, outputFilePath);

    // Upload the PDF to the output S3 bucket
    await s3
      .putObject({
        Bucket: outputBucket,
        Key: outputKey,
        Body: fs.createReadStream(outputFilePath),
      })
      .promise();

    console.log("PDF file uploaded successfully.");
  } catch (error) {
    console.error("Error processing file:", error);
    throw error;
  }
};
