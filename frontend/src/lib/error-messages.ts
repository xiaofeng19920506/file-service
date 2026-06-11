const MESSAGES: Record<string, string> = {
  unauthorized: '未登录或会话已过期，请重新登录',
  file_too_large: '文件超出大小限制，请压缩后重试',
  upload_failed: '上传失败，请检查网络后重试',
  missing_file: '未选择有效文件',
  missing_chunk: '分片上传异常，请重试',
  upload_not_found: '上传会话已过期，请重新上传',
  incomplete_upload: '上传未完成，请重试',
  assemble_failed: '文件组装失败，请重新上传',
  network_error: '网络连接失败，请检查网络',
  rate_limit_exceeded: '请求过于频繁，请稍后再试',
  invalid_webhook_url: 'Webhook URL 无效，需为 http(s) 地址',
  preview_conversion_failed: '预览转换失败，请安装 LibreOffice 或转为 .pptx',
  inputs_required: '请至少上传一个文件',
  unknown_blob_id: '文件引用无效，请重新上传',
  not_ready: '合并结果尚未就绪',
  expired: '下载链接已过期，请重新合并',
  invalid_token: '下载链接无效',
  content_already_exists: '上传失败，诗库中已有相同内容的文件',
  admin_required: '仅管理员可修改诗库文件信息',
  merge_forbidden: '当前账号无法使用合并功能',
  playlist_forbidden: '当前账号无法使用播放列表',
  search_forbidden: '当前账号无法搜索诗库',
  upload_forbidden: '当前账号无法上传文件',
  download_forbidden: '请登录后再下载或预览',
  delete_failed: '删除失败，请稍后重试',
  login_failed: '登录失败，请稍后重试',
  invalid_credentials: '邮箱或密码错误',
  invalid_email: '请输入有效的邮箱地址',
  weak_password: '密码至少需要 8 个字符',
  invalid_first_name: '名不能为空',
  invalid_last_name: '姓不能为空',
  email_already_exists: '该邮箱已注册',
  session_invalid: '登录已过期，请重新登录',
  load_users_failed: '加载用户列表失败',
  update_user_failed: '更新用户信息失败',
  user_not_found: '用户不存在',
  invalid_role: '无效的角色',
  last_admin_required: '至少需要保留一名管理员',
  cannot_change_own_role: '不能修改自己的角色',
  no_changes: '没有可保存的更改',
};

/** 将 API 错误码转为用户可读文案 */
export function friendlyError(
  code: string,
  t?: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (t) {
    const key = `errors.${code}`;
    const msg = t(key);
    if (msg !== key) return msg;
  }
  return MESSAGES[code] ?? code;
}
