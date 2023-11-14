FROM public.ecr.aws/shelf/lambda-libreoffice-base:7.4-node16-x86_64

COPY lambda-function/ ${LAMBDA_TASK_ROOT}/

RUN npm install

# Set the command to run your Lambda function
CMD [ "app.handler" ]
