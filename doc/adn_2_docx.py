from bin_adn import convert_from_ATGX
from huffman import huffman_decode

# Giải mã từ ATGX về chuỗi gốc
def decode_from_ATGX(atgx_code,file_nd,file_hu): 
    binary_code = convert_from_ATGX(atgx_code)
    # print("Binary Code:", len(binary_code))
    
    original_string = huffman_decode(binary_code,file_hu)
    with open(file_nd, "w", encoding="utf-8") as f:
        f.write(f"{original_string}\n")
    print(len(original_string))
    # return original_string
def read_from_file(filename):
    with open(filename, "r", encoding="utf-8") as f:
        content = f.read()
    return content

# Ví dụ sử dụng
atgx_code = read_from_file("ADN\\atgx.txt")  # Chuỗi mã hóa ATGX từ kết quả file mã hóa
decode_from_ATGX(atgx_code,"Data\\nd.txt","Json\\huffman.json")