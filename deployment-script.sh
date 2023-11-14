#!/bin/bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --output text --query 'Account')
# 设置 AWS CLI 配置
AWS_REGION="ap-southeast-1"
AWS_PROFILE="default"

# 设置 ECR 存储库名称
ECR_REPO_NAME="office-converter"

# 设置 CloudFormation 栈名称
CF_STACK_NAME="office-converter"

# 设置 Lambda 函数名称
LAMBDA_FUNCTION_NAME="OfficeConversionFunction"

# 设置 S3 存储桶名称
S3_BUCKET_NAME="streampi"

# 构建 Docker 镜像
docker build -t $ECR_REPO_NAME:latest .

# 登录到 Amazon ECR
aws ecr get-login-password --region $AWS_REGION --profile $AWS_PROFILE | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# 检查 ECR 存储库是否已存在
ECR_REPO_URI=$(aws ecr describe-repositories --repository-names $ECR_REPO_NAME --region $AWS_REGION --profile $AWS_PROFILE --query "repositories[0].repositoryUri" --output text 2>/dev/null)

if [ -z "$ECR_REPO_URI" ]; then
  # 如果不存在，则创建 ECR 存储库
  aws ecr create-repository --repository-name $ECR_REPO_NAME --region $AWS_REGION --profile $AWS_PROFILE

  # 获取 ECR 存储库 URI
  ECR_REPO_URI=$(aws ecr describe-repositories --repository-names $ECR_REPO_NAME --region $AWS_REGION --profile $AWS_PROFILE --query "repositories[0].repositoryUri" --output text)
fi

echo "ECR URI: $ECR_REPO_URI"
# 标记 Docker 镜像
docker tag $ECR_REPO_NAME:latest $ECR_REPO_URI:latest

# 推送 Docker 镜像到 ECR
# docker push $ECR_REPO_URI:latest

# 删除旧的 CloudFormation 堆栈
# aws cloudformation delete-stack --stack-name $CF_STACK_NAME --region $AWS_REGION --profile $AWS_PROFILE
# aws cloudformation wait stack-delete-complete --stack-name $CF_STACK_NAME --region $AWS_REGION --profile $AWS_PROFILE

# 部署新的 CloudFormation 堆栈
aws cloudformation deploy \
  --template-file cloudformation-template.yml \
  --stack-name $CF_STACK_NAME \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides ImageRepositoryName=$ECR_REPO_NAME  S3BucketName=$S3_BUCKET_NAME \
  --region $AWS_REGION \
  --profile $AWS_PROFILE \
  --capabilities CAPABILITY_NAMED_IAM

# 获取 Lambda 函数 ARN
LAMBDA_FUNCTION_ARN=$(aws cloudformation describe-stacks --stack-name $CF_STACK_NAME --region $AWS_REGION --profile $AWS_PROFILE --query "Stacks[0].Outputs[?OutputKey=='LambdaFunctionArn'].OutputValue" --output text)

echo "Lambda function deployed with ARN: $LAMBDA_FUNCTION_ARN"
