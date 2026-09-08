#ifndef C200_API_H
#define C200_API_H

#include <stddef.h>

int c200_control_get(int fd, const char *name, char *out, size_t out_len);
int c200_control_set(int fd, const char *name, const char *val);

#endif
